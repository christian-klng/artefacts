import { ChevronDown } from "lucide-react";

type FaqItem = { question: string; answer: string };

const EMAIL_RE = /([\w.+-]+@[\w-]+\.[\w.-]+)/g;

// Turn any email address in the answer into a mailto link, keeping the copy a
// plain (translatable) string in the message dictionaries.
function renderAnswer(answer: string) {
  return answer.split(EMAIL_RE).map((part, i) =>
    part.match(EMAIL_RE) ? (
      <a
        key={i}
        href={`mailto:${part}`}
        className="text-info underline underline-offset-2 transition-colors hover:text-info-deep dark:hover:text-info"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}

export function Faq({
  heading,
  items,
}: {
  heading: string;
  items: readonly FaqItem[];
}) {
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold tracking-tight">{heading}</h2>
      <div className="border-t border-neutral-200 dark:border-neutral-800">
        {items.map((item) => (
          <details
            key={item.question}
            className="group border-b border-neutral-200 py-4 dark:border-neutral-800"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
              {item.question}
              <ChevronDown
                className="h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                aria-hidden
              />
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-neutral-500">
              {renderAnswer(item.answer)}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}
