import React from 'react';

export const LoadingDots: React.FC = () => {
  return (
    <div className="flex space-x-1 items-center h-6">
      <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
      <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
      <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></div>
    </div>
  );
};