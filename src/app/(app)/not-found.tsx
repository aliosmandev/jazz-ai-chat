"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md text-center space-y-4">
        <h1 className="text-3xl font-bold text-gray-800">Page Not Found</h1>
        <p className="text-gray-600">Sorry, the page you're looking for doesn't exist.</p>
        <Button asChild>
          <Link href="/chat/new">Start a New Chat</Link>
        </Button>
      </div>
    </div>
  );
} 
