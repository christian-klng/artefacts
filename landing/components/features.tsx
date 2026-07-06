import {
  Palette,
  ShieldCheck,
  Shapes,
  Rocket,
  Server,
  Wallet,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

type Feature = { title: string; description: string };

// Icons are paired to the copy by position — same order as the `features.items`
// array in the message dictionaries.
const ICONS: LucideIcon[] = [Palette, ShieldCheck, Shapes, Rocket, Server, Wallet];

export function Features({ items }: { items: readonly Feature[] }) {
  return (
    <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
      {items.map((feature, i) => {
        const Icon = ICONS[i] ?? Sparkles;
        return (
          <div key={feature.title} className="group flex gap-3">
            <Icon
              className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400 transition duration-300 group-hover:text-info motion-safe:group-hover:rotate-[12deg] motion-reduce:transition-none dark:text-neutral-500"
              aria-hidden
            />
            <div>
              <h3 className="text-sm font-medium">{feature.title}</h3>
              <p className="mt-1 text-sm text-neutral-500">
                {feature.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
