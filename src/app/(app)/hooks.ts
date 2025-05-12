import { track } from "@vercel/analytics";
import { useAccount } from "jazz-react";
import type { ID } from "jazz-tools";
import { Account, Group } from "jazz-tools";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { Chat, ListOfChatMessages } from "./schema";

export function useCreateChat() {
  const router = useRouter();
  const { me } = useAccount();
  const [loading, setLoading] = useState(false);

  async function createChat() {
    if (loading) return;

    try {
      setLoading(true);
      console.log("Creating new chat from hook");

      const worker = await Account.load(
        "co_zm1eobD4gAy4hfPrsKR7vuEShYz" as ID<Account>,
        { loadAs: me }
      );

      if (!worker) {
        console.error("Worker not found");
        toast.error("Could not load AI assistant");
        return;
      }
      console.log("Worker loaded:", worker.id);

      const group = Group.create();
      console.log("Group created");

      group.addMember(me, "admin");
      group.addMember(worker, "writer");
      group.addMember("everyone", "reader");

      console.log("Group members added with proper permissions");

      const messages = ListOfChatMessages.create([], { owner: group });
      console.log("Message list created");

      const chat = await Chat.create(
        {
          messages,
          name: "Unnamed",
        },
        {
          owner: group,
        }
      );

      console.log("Chat created:", chat.id);
      await chat.waitForSync();

      if (!me?.root?.chats) {
        console.error("User's chat list not found");
        toast.error("Could not find your chats");
        return;
      }

      me.root.chats.push(chat);
      console.log("Chat added to user's chat list");

      setTimeout(() => {
        router.push(`/chat/${chat.id}`);
        track("Create Chat");
      }, 1000);
    } catch (error) {
      console.error("Error creating chat:", error);
      toast.error("Failed to create chat");
    } finally {
      setLoading(false);
    }
  }

  return { createChat, loading };
}
