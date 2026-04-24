import { motion, AnimatePresence } from "framer-motion";

interface Props {
  text: string;
  visible: boolean;
}

// Small floating bubble that shows the current streaming synthesis text
// above the decree card as it materializes.
export function ChunkBubble({ text, visible }: Props) {
  return (
    <AnimatePresence>
      {visible && text && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3 }}
          className="mx-auto max-w-md rounded-full border border-amber-dim/30 bg-ink/70 px-4 py-1.5 text-center text-xs text-amber-glow/80 backdrop-blur"
        >
          {text}
          <span className="ml-0.5 inline-block h-2 w-1 animate-flicker bg-amber-glow align-middle" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
