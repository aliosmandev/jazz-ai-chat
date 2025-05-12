"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md text-center space-y-4">
        <h1 className="text-2xl font-bold text-gray-800">Chat Not Found</h1>
        <p className="text-gray-600">The chat you are looking for does not exist or might have been deleted.</p>
        <Button onClick={() => router.push("/chat/new")}>Create New Chat</Button>
      </div>
    </div>
  );
} 
