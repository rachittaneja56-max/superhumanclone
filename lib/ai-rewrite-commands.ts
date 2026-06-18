export const REWRITE_COMMANDS = [
  {
    id: "improve_tone",
    label: "Polish",
    slash: "/improve",
    aliases: ["/improve", "/improve-tone"],
    description: "Smooth the wording without changing the meaning.",
  },
  {
    id: "make_shorter",
    label: "Concise",
    slash: "/shorter",
    aliases: ["/shorter", "/make-shorter"],
    description: "Tighten the draft and keep the key points.",
  },
  {
    id: "make_formal",
    label: "Formal",
    slash: "/formal",
    aliases: ["/formal"],
    description: "Shift the draft to a more formal tone.",
  },
  {
    id: "convert_to_bullets",
    label: "Bullets",
    slash: "/bullet",
    aliases: ["/bullet", "/bullets"],
    description: "Turn the message into a short bullet list.",
  },
  {
    id: "translate",
    label: "Translate",
    slash: "/translate",
    aliases: ["/translate"],
    description: "Translate the draft into another language.",
  },
] as const;

export type RewriteCommandId = (typeof REWRITE_COMMANDS)[number]["id"];

export function filterRewriteCommands(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return REWRITE_COMMANDS;
  }

  return REWRITE_COMMANDS.filter((command) => {
    return (
      command.label.toLowerCase().includes(normalized) ||
      command.description.toLowerCase().includes(normalized) ||
      command.aliases.some((alias) => alias.slice(1).includes(normalized))
    );
  });
}
