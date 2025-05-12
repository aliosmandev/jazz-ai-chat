"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AnimatePresence, motion } from "framer-motion";
import { useAccount, useCoState } from "jazz-react";
import { Account, CoPlainText, Group, type ID } from "jazz-tools";
import { Loader2, Send } from "lucide-react";
import { notFound, useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import Markdown from "react-markdown";
import { Chat, ChatMessage, ListOfChatMessages, Reactions } from "../../schema";

export default function ChatPage() {
  const { id } = useParams();

  return <RenderChat chatId={id as string} />;
}

function RenderChat({ chatId }: { chatId: string }) {
  const chat = useCoState(Chat, chatId as ID<Chat>, {
    resolve: {
      messages: {
        $each: {
          text: true,
          reactions: true,
        }
      },
    },
  });
  const { me } = useAccount();
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [isFirstRender, setIsFirstRender] = useState(true);
  const [activeModel, setActiveModel] = useState<"gpt" | "gemini">("gpt");

  console.log("Chat loaded in UI:", {
    id: chat?.id,
    name: chat?.name,
    messageCount: chat?.messages?.length || 0,
  });

  // If chat doesn't exist and it's not "new", show not found
  useEffect(() => {
    if (!chat && chatId !== "new" && me) {
      // Give it some time to load before considering it not found
      const timer = setTimeout(() => {
        if (!chat) {
          notFound();
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [chat, chatId, me]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({
      behavior: isFirstRender ? "instant" : "smooth",
    });

    if (isFirstRender && (chat?.messages?.length ?? 0) > 0) {
      setIsFirstRender(false);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(scrollToBottom, [chat?.messages]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (chatId === "new" && me) {
      console.log("Creating new chat...");
      createChat();
    }
  }, [chatId, me]);

  // Add observer effect to monitor message changes
  useEffect(() => {
    if (chat?.messages) {
      console.log("Messages updated:", chat.messages.length);

      // Log each message with its details
      chat.messages.forEach((msg, i) => {
        if (!msg) return;
        console.log(`Message ${i}:`, {
          id: msg.id,
          role: msg.role,
          model: msg.model,
          content: msg.content?.substring(0, 30) + (msg.content?.length > 30 ? "..." : ""),
          textContent: msg.text?.toString()?.substring(0, 30) + (msg.text?.toString()?.length > 30 ? "..." : "")
        });
      });
    }
  }, [chat?.messages?.length]);

  async function createChat() {
    try {
      console.log("Creating chat, me:", me?.id);

      // Worker hesabını önce yükle
      const worker = await Account.load(
        "co_zm1eobD4gAy4hfPrsKR7vuEShYz" as ID<Account>,
        {
          loadAs: me,
        }
      );

      if (!worker) {
        console.error("Worker account not found");
        setError("Failed to load worker account");
        return;
      }
      console.log("Worker loaded:", worker.id);

      // Grup oluşturma ve yetkilendirmeyi geliştirelim
      const group = Group.create({ owner: me });
      console.log("Group created");

      // Önce grubu senkronize edelim
      await group.waitForSync();
      console.log("Group synced after creation");

      // Önce kullanıcıya admin yetkisi verelim ve senkron olduğundan emin olalım
      group.addMember(me, "admin");
      await group.waitForSync();
      console.log("User added as admin and synced");

      // Sonra worker'a yazar yetkisi verelim ve senkron olduğundan emin olalım
      group.addMember(worker, "writer");
      await group.waitForSync();
      console.log("Worker added as writer and synced");

      // Grup izinlerini kontrol edelim
      try {
        const members = group.members;
        console.log("Group members:", members);
      } catch (err) {
        console.error("Could not get group members:", err);
      }

      const list = ListOfChatMessages.create([], { owner: group });
      console.log("Message list created");
      await list.waitForSync();
      console.log("Message list synced");

      const chat = await Chat.create(
        {
          messages: list,
          name: "Unnamed",
        },
        {
          owner: group,
        }
      );

      console.log("Chat created:", chat.id);
      await chat.waitForSync();
      console.log("Chat synced after creation");

      if (!me.root) {
        console.error("User root not found");
        setError("User root not found");
        return;
      }

      if (!me.root.chats) {
        console.error("User chats not found");
        setError("User chats not found");
        return;
      }

      me.root.chats.push(chat);
      console.log("Chat added to user's chats");
      await me.root.chats.waitForSync();
      console.log("User chats synced after adding new chat");

      // Give a moment for the chat to fully sync
      setTimeout(() => {
        router.push(`/chat/${chat.id}`);
      }, 1000);
    } catch (err) {
      console.error("Error creating chat:", err);
      setError("Failed to create chat");
      toast.error("Failed to create chat");
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!chat || !message.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      console.log("Sending message to chat:", chatId);
      console.log("Chat object exists:", !!chat);
      console.log("Chat ID from object:", chat.id);

      const chatMessage = ChatMessage.create(
        {
          content: message, // TODO: remove
          role: "user",
          text: CoPlainText.create(message, { owner: chat._owner }),
          reactions: Reactions.create([], { owner: chat._owner }),
        },
        { owner: chat._owner }
      );

      chat.messages?.push(chatMessage);
      setMessage("");

      console.log("Message added to chat, waiting for sync");
      await chatMessage.waitForSync();
      console.log("Message synced");

      // Call API to get responses from both models
      console.log("Calling API with chatId:", chatId);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chatId: chat.id, // Use the actual chat ID from the object
          userId: me?.id,
          lastMessageId: chatMessage?.id,
          models: ["gpt", "gemini"], // Request responses from both models
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API response not OK:", response.status, errorText);
        throw new Error(errorText || "Failed to get response");
      }

      const data = await response.json();
      console.log("API response:", data);
    } catch (err) {
      console.error("Error sending message:", err);
      setError("Failed to send message");
      toast.error("Failed to send message");
    } finally {
      setIsLoading(false);
    }
  }

  // Use the messages in their natural order from the database
  const orderedMessages = chat?.messages;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md text-center space-y-4">
          <h1 className="text-2xl font-bold text-red-600">Error</h1>
          <p className="text-gray-600">{error}</p>
          <Button onClick={() => router.push("/chat/new")}>Try Again</Button>
        </div>
      </div>
    );
  }

  if (chatId === "new") {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md">
          <h1 className="text-xl font-bold mb-4">Creating new chat...</h1>
          <div className="flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  // Group messages by conversation pairs (user message followed by AI responses)
  const conversationPairs: Array<{
    userMessage: ChatMessage | null;
    gptResponse: ChatMessage | null;
    geminiResponse: ChatMessage | null;
  }> = [];

  // Process messages to group them into conversation pairs
  orderedMessages?.forEach((message) => {
    // Debug logging
    console.log("Processing message:", {
      id: message.id,
      role: message.role,
      model: message.model,
      content: message.content,
      textExists: !!message.text,
      textValue: message.text?.toString()
    });

    if (message.role === "user") {
      // Start a new conversation pair with this user message
      conversationPairs.push({
        userMessage: message,
        gptResponse: null,
        geminiResponse: null,
      });
      console.log("Added user message to conversation:", message.id);
    } else if (message.role === "assistant") {
      // If we have no conversation pairs, create one first
      if (conversationPairs.length === 0) {
        conversationPairs.push({
          userMessage: null,
          gptResponse: null,
          geminiResponse: null,
        });
        console.log("Created placeholder conversation pair for orphaned assistant message");
      }

      // Add this AI response to the last conversation pair
      const lastPair = conversationPairs[conversationPairs.length - 1];

      // IMPORTANT: Explicitly check for the model field      
      let model = "unknown";
      if (typeof message.model === 'string') {
        model = message.model;
        console.log("Found model from property:", model);
      }

      // Default to gpt if not specified
      if (model === "unknown" || model === "") {
        model = "gpt";
        console.log("Using default model (gpt) for message:", message.id);
      }

      console.log("Processing assistant message:", { id: message.id, model });

      if (model === "gpt" || model.includes("gpt")) {
        lastPair.gptResponse = message;
        console.log("Added GPT response to conversation:", message.id);
      } else if (model === "gemini" || model.includes("gemini")) {
        lastPair.geminiResponse = message;
        console.log("Added Gemini response to conversation:", message.id);
      } else {
        console.warn("Unrecognized model type:", model);
        // Default to GPT if unknown
        lastPair.gptResponse = message;
      }
    }
  });

  // Debug: Log the final conversation pairs
  console.log("Conversation pairs:", conversationPairs.map(pair => ({
    user: pair.userMessage?.id,
    gpt: pair.gptResponse?.id,
    gemini: pair.geminiResponse?.id
  })));

  return (
    <div className="flex-1 flex flex-col h-screen bg-gray-100">
      <header className="bg-white shadow-sm p-4 flex justify-between items-center">
        {/* <SidebarTrigger /> */}
        <h1 className="text-2xl font-bold text-gray-800">
          {chat?.name || "Chat"}
        </h1>
        <Button
          variant="outline"
          onClick={() => {
            if (chat?._owner) {
              chat._owner.castAs(Group).addMember("everyone", "reader");
              navigator.clipboard.writeText(window.location.href);
              toast.success("Copied to clipboard");
            } else {
              toast.error("Cannot share this chat");
            }
          }}
        >
          Share
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence>
          {conversationPairs.map((pair, index) => (
            <div key={index} className="space-y-4">
              {/* User message */}
              {pair.userMessage && (
                <motion.div
                  key={`user-${pair.userMessage.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  className="flex justify-end"
                >
                  <div className="max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl rounded-lg p-3 bg-blue-500 text-white">
                    <Markdown className="min-h-[24px]">
                      {pair.userMessage.text?.toString() || pair.userMessage.content || ""}
                    </Markdown>
                  </div>
                </motion.div>
              )}

              {/* AI response section with model tabs */}
              {(pair.gptResponse || pair.geminiResponse) && (
                <motion.div
                  key={`ai-${index}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  className="flex justify-start"
                >
                  <div className="max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl rounded-lg p-3 bg-white text-gray-800">
                    <div className="flex space-x-2 mb-2">
                      <Button
                        variant={activeModel === "gpt" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setActiveModel("gpt")}
                        className="w-1/2"
                      >
                        GPT-4
                      </Button>
                      <Button
                        variant={activeModel === "gemini" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setActiveModel("gemini")}
                        className="w-1/2"
                      >
                        Gemini
                      </Button>
                    </div>

                    {/* GPT Response */}
                    {activeModel === "gpt" && (
                      pair.gptResponse ? (
                        <Markdown className="min-h-[24px]">
                          {pair.gptResponse.text?.toString() ||
                            pair.gptResponse.content ||
                            "No response content available"}
                        </Markdown>
                      ) : (
                        <div className="flex justify-center py-4">
                          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                        </div>
                      )
                    )}

                    {/* Gemini Response */}
                    {activeModel === "gemini" && (
                      pair.geminiResponse ? (
                        <Markdown className="min-h-[24px]">
                          {pair.geminiResponse.text?.toString() ||
                            pair.geminiResponse.content ||
                            "No response content available"}
                        </Markdown>
                      ) : (
                        <div className="flex justify-center py-4">
                          <Loader2 className="w-6 h-6 animate-spin text-green-500" />
                        </div>
                      )
                    )}

                    {/* Display reactions if any */}
                    {((activeModel === "gpt" && pair.gptResponse?.reactions) ||
                      (activeModel === "gemini" && pair.geminiResponse?.reactions)) && (
                        <div className="text-sm mt-2 opacity-70">
                          {activeModel === "gpt" && pair.gptResponse?.reactions &&
                            Object.entries(pair.gptResponse.reactions.perSession || {}).map(([key, value]) => (
                              <span key={key} className="mr-1">{String(value)}</span>
                            ))
                          }
                          {activeModel === "gemini" && pair.geminiResponse?.reactions &&
                            Object.entries(pair.geminiResponse.reactions.perSession || {}).map(([key, value]) => (
                              <span key={key} className="mr-1">{String(value)}</span>
                            ))
                          }
                        </div>
                      )}
                  </div>
                </motion.div>
              )}
            </div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={sendMessage} className="bg-white p-4 shadow-lg">
        <div className="flex items-center space-x-2">
          <Input
            type="text"
            autoFocus
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message..."
            disabled={isLoading}
          />
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Send className="w-6 h-6" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
