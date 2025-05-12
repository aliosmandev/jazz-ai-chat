import { startWorker } from "jazz-nodejs";
import { Account, CoPlainText, Group, type ID } from "jazz-tools";
import {
  Chat,
  ChatMessage,
  Reactions
} from "../../../(app)/schema";

export async function GET(req: Request) {
  console.log("Test API called");

  const results = {
    phase1: false,
    phase2: false,
    phase3: false,
    phase4: false,
    errorMessage: ""
  };

  try {
    // 0. Start worker first
    console.log("Starting worker...");
    const w = await startWorker({
      syncServer: "wss://cloud.jazz.tools/?key=aliosman@hellospace.world",
    });

    const workerAccount = w.worker;
    console.log("Worker started:", workerAccount.id);

    // 1. First load user account with worker
    const userId = "co_zkcC8BAokN6qBySEunqmAwNiDDA" as ID<Account>;
    const chatId = "co_zjSoULirjXouuTNVhpgWY1cjWAJ" as ID<Chat>;

    console.log("Loading user account with worker...");
    const account = await Account.load(userId, { loadAs: workerAccount });
    if (!account) {
      throw new Error("Account not found");
    }
    console.log("User account loaded:", account.id);
    results.phase1 = true;

    // Load the chat with explicit resolve for messages
    console.log("Loading chat:", chatId);
    const chat = await Chat.load(chatId, {
      loadAs: workerAccount,
      resolve: {
        messages: true
      }
    });

    if (!chat) {
      throw new Error("Chat not found");
    }
    console.log("Chat loaded:", chat.id);
    console.log("Chat owner ID:", typeof chat._owner, chat._owner);

    // Extract the owner ID directly from logs
    const ownerGroupId = "co_zgEQdGfoZe8EPkWzcPw1JKt225f" as ID<Group>;
    console.log("Using group ID:", ownerGroupId);

    const ownerGroup = await Group.load(ownerGroupId, { loadAs: workerAccount });
    if (!ownerGroup) {
      throw new Error("Chat owner group could not be loaded");
    }
    console.log("Chat owner group loaded successfully:", ownerGroup.id);

    // Set phase2 as complete
    results.phase2 = true;

    // 3. Create a test message directly
    console.log("Creating test message...");
    const textContent = "Bu bir test mesajıdır - " + new Date().toISOString();

    // Create text with the owner being the group
    const text = CoPlainText.create(textContent, { owner: ownerGroup });
    console.log("Text object created with ID:", text.id);

    // Create message directly with explicit model field
    const messageProps = {
      content: textContent,
      text: text,
      role: "assistant" as const,
      reactions: Reactions.create([], { owner: ownerGroup }),
      model: "test-model"  // This should persist
    };

    const chatMessage = ChatMessage.create(messageProps, { owner: ownerGroup });

    // Log created message and verify model field
    console.log("Message created:", chatMessage.id);
    console.log("Message model field:", chatMessage.model);

    // Wait for sync
    await chatMessage.waitForSync();
    console.log("Message synced");

    results.phase3 = true;

    // 4. Add the message to the chat
    if (!chat.messages) {
      throw new Error("Chat messages array is undefined");
    }

    try {
      console.log("Adding message to chat...");
      chat.messages.push(chatMessage);
      console.log("Message added to chat");

      // First sync messages
      await chat.messages.waitForSync();
      console.log("Messages array synced");

      // Then sync the entire chat
      await chat.waitForSync();
      console.log("Chat fully synced");

      // Force overall sync
      await workerAccount.waitForAllCoValuesSync({ timeout: 5000 });
      console.log("All values synced");

      // Verify message is in the chat's messages array
      const messageIndex = chat.messages.findIndex(m => m && m.id === chatMessage.id);
      console.log("Message index in chat messages:", messageIndex);

      if (messageIndex !== -1) {
        console.log("Message found in chat at index:", messageIndex);

        // Also verify the model field persisted
        const foundMessage = chat.messages[messageIndex];
        // Check if foundMessage is not null before accessing its properties
        if (foundMessage) {
          console.log("Found message model field:", foundMessage.model);
        } else {
          console.log("Found message is null despite valid index");
        }

        results.phase4 = true;
      } else {
        throw new Error("Message not found in chat after adding");
      }
    } catch (error) {
      console.error("Error adding/verifying message in chat:", error);
      throw new Error("Failed to verify message in chat: " + error);
    }

    return Response.json({
      success: true,
      message: "Test completed successfully",
      chatId: chat?.id,
      messageId: chatMessage.id,
      model: chatMessage.model,
      results
    });
  } catch (error: any) {
    console.error("Test error:", error);
    results.errorMessage = error.message || "Unknown error";

    return Response.json({
      success: false,
      error: error.message || "Unknown error",
      results
    }, { status: 500 });
  }
} 
