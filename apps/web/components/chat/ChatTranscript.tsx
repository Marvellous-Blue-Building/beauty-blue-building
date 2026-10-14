import type { ChatMessage } from "@/types/chat";
import { ChatBubble } from "@/components/chat/ChatBubble";
import { ChatProductList } from "@/components/chat/ChatProductList";
import { dateSeparatorLabel } from "@/lib/format";

/** Renders a message list with WhatsApp-style date separators — a badge
 * shows above the first message of each new day ("Yesterday" exactly one
 * day back, dd/MM/yyyy further back), nothing for today's group. */
export function ChatTranscript({ messages }: { messages: ChatMessage[] }) {
  return (
    <>
      {messages.map((m, i) => {
        const dateKey = m.createdAt.slice(0, 10);
        const isNewDay = i === 0 || dateKey !== messages[i - 1].createdAt.slice(0, 10);
        const label = isNewDay ? dateSeparatorLabel(m.createdAt) : null;

        return (
          <div key={m.id}>
            {label && (
              <div className="my-2 flex justify-center">
                <span className="rounded-full bg-surface-2 px-3 py-1 text-[10.5px] font-semibold text-text-muted">
                  {label}
                </span>
              </div>
            )}
            <ChatBubble message={m} />
            {m.products && m.products.length > 0 && <ChatProductList products={m.products} />}
          </div>
        );
      })}
    </>
  );
}
