"use client";

import { Button } from "@/components/ui/button";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md text-center space-y-4">
        <h1 className="text-3xl font-bold text-red-600">Something went wrong!</h1>
        <p className="text-gray-600">
          An unexpected error occurred. Please try again later.
        </p>
        <div className="flex space-x-4 justify-center">
          <Button onClick={reset}>Try Again</Button>
          <Button variant="outline" onClick={() => window.location.href = "/chat/new"}>
            Go to Home
          </Button>
        </div>
      </div>
    </div>
  );
} 
