import React from 'react';
import { Message } from '../types';
import ReactMarkdown from 'react-markdown';
import { User, AlertCircle } from 'lucide-react';

interface ChatBubbleProps {
  message: Message;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isError = message.isError;

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] md:max-w-[75%] ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-3`}>
        {/* Avatar */}
        <div className={`
          flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center overflow-hidden border border-slate-700/50
          ${isUser ? 'bg-orange-600' : isError ? 'bg-red-500' : 'bg-transparent'}
        `}>
          {isUser ? (
            <User size={16} className="text-white" />
          ) : isError ? (
            <AlertCircle size={16} className="text-white" />
          ) : (
            <img src="https://i.ibb.co/ksSCbjq2/Tukatuu-Orange.png" alt="Tukatuu AI" className="w-full h-full object-cover" />
          )}
        </div>

        {/* Bubble */}
        <div className={`
          p-4 rounded-2xl text-sm leading-relaxed shadow-lg
          ${isUser 
            ? 'bg-orange-600 text-white rounded-tr-none' 
            : isError
              ? 'bg-red-900/30 border border-red-800 text-red-200 rounded-tl-none'
              : 'bg-slate-800/80 text-slate-200 border border-slate-700/50 rounded-tl-none'
          }
        `}>
          {isUser ? (
            <p className="whitespace-pre-wrap font-medium">{message.text}</p>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none font-normal">
              <ReactMarkdown>{message.text}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};