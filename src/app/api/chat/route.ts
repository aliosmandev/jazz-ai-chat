import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { startWorker } from "jazz-nodejs";
import { Account, CoPlainText, Group } from "jazz-tools";
import {
  Chat,
  ChatMessage,
  Reactions
} from "../../(app)/schema";

let worker: Account | undefined;

export async function POST(req: Request) {
  if (!worker) {
    try {
      const w = await startWorker({
        syncServer: "wss://cloud.jazz.tools/?key=aliosman@hellospace.world",
      });

      console.log("Worker started");
      worker = w.worker;
    } catch (e) {
      console.error("Error starting worker", e);
      return Response.json({ error: "Error starting worker" }, { status: 500 });
    }
  }

  try {
    const { userId, chatId, models = ["gpt"] } = await req.json();

    if (!userId || !chatId) {
      console.error("Missing required parameters:", { userId, chatId });
      return Response.json({ error: "Missing userId or chatId" }, { status: 400 });
    }

    console.log("API Request - Chat ID:", chatId, "User ID:", userId);

    if (!worker) {
      console.error("Worker not initialized");
      return Response.json({ error: "Worker not initialized" }, { status: 500 });
    }

    // Load user account
    const account = await Account.load(userId, { loadAs: worker });
    console.log("Account loaded:", account?.id);

    if (!account) {
      console.error("Account not found:", userId);
      return Response.json({ error: "Account not found" }, { status: 404 });
    }

    // Load the chat and track which account successfully loaded it
    let chat: Chat | null;
    let loadSuccessAccount = null;

    try {
      console.log("Trying to load chat with user account");
      chat = await Chat.load(chatId, {
        loadAs: account,
        resolve: {
          messages: { $each: { text: true, reactions: true } },
        },
      });
      loadSuccessAccount = account;
      console.log("Chat loaded with user account:", chat?.id);
    } catch (userErr) {
      console.error("Failed to load chat with user account:", userErr);

      try {
        console.log("Trying to load chat with worker account");
        chat = await Chat.load(chatId, {
          loadAs: worker,
          resolve: {
            messages: { $each: { text: true, reactions: true } },
          },
        });
        loadSuccessAccount = worker;
        console.log("Chat loaded with worker account:", chat?.id);
      } catch (workerErr) {
        console.error("Failed to load chat with worker account:", workerErr);
        return Response.json({ error: "Failed to load chat" }, { status: 404 });
      }
    }

    if (!chat) {
      console.error("Chat not found with id:", chatId);
      return Response.json({ error: "Chat not found" }, { status: 404 });
    }

    // Get the group that owns the chat
    let chatGroup = null;
    try {
      if (chat._owner) {
        chatGroup = chat._owner.castAs(Group);
        console.log("Chat owner is Group:", chatGroup.id);
      }
    } catch (err) {
      console.error("Chat owner is not a Group:", err);
    }

    // Collect user messages for context
    const userMessages: string[] = [];
    try {
      chat.messages?.forEach(message => {
        if (message && message.role === "user" && message.text) {
          userMessages.push(message.text.toString() || "");
        }
      });
      console.log("Collected user messages:", userMessages.length);
    } catch (err) {
      console.error("Error collecting user messages:", err);
    }

    if (userMessages.length === 0) {
      return Response.json({ error: "No user messages to respond to" }, { status: 400 });
    }

    // Use the account that successfully loaded the chat
    const effectiveAccount = loadSuccessAccount || account;
    console.log("Using account for operations:", effectiveAccount.id);

    // Process each requested model
    const results = {
      gpt: false,
      gemini: false
    };

    for (const modelType of models) {
      if (modelType !== "gpt" && modelType !== "gemini") continue;

      console.log(`Processing ${modelType} model`);

      try {
        // 1. Generate the response text using AI
        const responseText = await generateModelResponse(userMessages, modelType);
        console.log(`${modelType} response generated:`, responseText.length, "chars");

        if (!responseText) {
          console.log(`Empty ${modelType} response, skipping`);
          continue;
        }

        // 2. Create the text field for the message
        console.log(`Creating text object for ${modelType}`);
        const textObj = CoPlainText.create(responseText, { owner: chat._owner });
        // Text objects don't need to be synced separately
        console.log(`Text object created for ${modelType}`);

        // 3. Create the message with proper model field
        console.log(`Creating message object for ${modelType}`);
        const messageProps = {
          content: responseText,
          text: textObj,
          role: "assistant" as const,
          reactions: Reactions.create([], { owner: chat._owner }),
          model: modelType
        };

        // 4. Create the message and wait for it to be established
        const message = ChatMessage.create(messageProps, { owner: chat._owner });
        await message.waitForSync();

        console.log('message created', message)

        console.log(`Message synced for ${modelType}, has model:`, message.model);

        // 5. Add to chat and wait for sync again
        if (chat.messages) {
          console.log(`Adding ${modelType} message to chat`);
          chat.messages.push(message);
          await chat.messages.waitForSync();
          console.log(`Chat messages synced after adding ${modelType} response`);

          results[modelType as "gpt" | "gemini"] = true;
        } else {
          console.error(`Chat messages array is undefined for ${modelType}`);
        }
      } catch (err) {
        console.error(`Error processing ${modelType} model:`, err);
      }
    }

    console.log("All model processing complete, results:", results);

    // Final sync to ensure everything is persisted
    try {
      await worker?.waitForAllCoValuesSync({ timeout: 5000 });
      console.log("Final sync complete");
    } catch (syncErr) {
      console.error("Error in final sync:", syncErr);
    }

    return Response.json({
      chatId: chat?.id,
      success: true,
      modelResults: results
    });
  } catch (e: any) {
    console.error("Unhandled error in chat API:", e);
    return Response.json({ error: `Internal server error: ${e.message || 'Unknown error'}` }, { status: 500 });
  }
}

// Helper function to generate AI response text
async function generateModelResponse(userMessages: string[], modelType: "gpt" | "gemini"): Promise<string> {
  try {
    console.log(`Generating ${modelType} response for ${userMessages.length} messages`);

    const systemPrompt = modelType === "gpt"
      ? "You are like a friend in a whatsapp group chat. Don't ever say that you're here to hang out. Don't behave like a system. Only answer to the last message from the user. The messages before are just context."
      : "You are a helpful, friendly assistant. Respond to the user's message in a conversational way.";

    const model = modelType === "gpt"
      ? openai("gpt-4.1-nano")
      : google("gemini-1.5-pro");

    // For single-shot response rather than streaming
    const result = await generateText({
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        ...userMessages.map((content, index) => ({
          role: "user" as const,
          content: content,
        }))
      ],
    });

    return result.text;
  } catch (err) {
    console.error(`Error generating ${modelType} response:`, err);
    return `Sorry, I encountered an error while processing your request.`;
  }
}
