"use client";

import { AttributeRequest } from "@/lib/api";

interface Props {
  attributes: AttributeRequest[];
  onChange: (attrs: AttributeRequest[]) => void;
}

const PRIORITY_CONFIG = {
  high:   { label: "High",   color: "bg-red-500/20 text-red-300 ring-1 ring-red-500/40" },
  medium: { label: "Medium", color: "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40" },
  low:    { label: "Low",    color: "bg-white/10 text-white/50 ring-1 ring-white/10" },
};

const SUGGESTIONS = [
  "red shirt", "blue jeans", "backpack", "cap", "beard",
  "yellow jacket", "black hoodie", "sunglasses", "white shoes",
];

export default function AttributeBuilder({ attributes, onChange }: Props) {
  const add = () => {
    onChange([...attributes, { name: "", priority: "medium" }]);
  };

  const remove = (i: number) => {
    onChange(attributes.filter((_, idx) => idx !== i));
  };

  const update = (i: number, patch: Partial<AttributeRequest>) => {
    onChange(attributes.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  };

  const cyclePriority = (current: AttributeRequest["priority"]): AttributeRequest["priority"] => {
    const order: AttributeRequest["priority"][] = ["high", "medium", "low"];
    return order[(order.indexOf(current) + 1) % order.length];
  };

  const addSuggestion = (name: string) => {
    if (attributes.some(a => a.name.toLowerCase() === name.toLowerCase())) return;
    onChange([...attributes, { name, priority: "medium" }]);
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
        Target attributes
      </label>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col gap-3">
        {/* Attribute rows */}
        {attributes.map((attr, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={attr.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="e.g. red shirt, backpack, beard…"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2
                         text-sm text-white placeholder:text-white/20
                         focus:outline-none focus:border-violet-500/60 transition-colors"
            />
            {/* Priority toggle badge */}
            <button
              onClick={() => update(i, { priority: cyclePriority(attr.priority) })}
              title="Click to cycle priority"
              className={`
                shrink-0 px-2 py-1 rounded-md text-xs font-medium transition-all
                ${PRIORITY_CONFIG[attr.priority].color}
              `}
            >
              {PRIORITY_CONFIG[attr.priority].label}
            </button>
            {/* Remove */}
            <button
              onClick={() => remove(i)}
              className="shrink-0 w-7 h-7 rounded-md bg-white/5 hover:bg-red-500/20
                         flex items-center justify-center transition-colors group"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                   className="text-white/30 group-hover:text-red-400 transition-colors">
                <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        ))}

        {/* Add row */}
        <button
          onClick={add}
          className="flex items-center gap-2 text-xs text-white/40 hover:text-violet-400
                     transition-colors py-1"
        >
          <span className="w-5 h-5 rounded-md bg-white/5 flex items-center justify-center text-base leading-none">+</span>
          Add attribute
        </button>
      </div>

      {/* Priority legend */}
      <div className="flex gap-3 text-xs text-white/30">
        {(Object.entries(PRIORITY_CONFIG) as [AttributeRequest["priority"], typeof PRIORITY_CONFIG[keyof typeof PRIORITY_CONFIG]][]).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1">
            <span className={`inline-block w-2 h-2 rounded-full ${k === "high" ? "bg-red-400" : k === "medium" ? "bg-amber-400" : "bg-white/20"}`}/>
            {v.label} priority
          </span>
        ))}
        <span className="ml-auto italic">Click badge to change</span>
      </div>

      {/* Quick-add suggestions */}
      <div>
        <p className="text-xs text-white/30 mb-2">Quick add</p>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.filter(s => !attributes.some(a => a.name === s)).slice(0, 6).map(s => (
            <button
              key={s}
              onClick={() => addSuggestion(s)}
              className="px-2 py-1 rounded-md bg-white/5 hover:bg-violet-500/20
                         text-xs text-white/40 hover:text-violet-300 transition-colors border border-white/5"
            >
              + {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
