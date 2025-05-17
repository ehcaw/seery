// components/Notch
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { svgMap, blurVariants } from "../lib";

type NotchState =
  | "inactive"
  | "dormant"
  | "prompted"
  | "thinking"
  | "answering";

const NotchComponent: React.FC<{
  onChange?: (state: NotchState) => void;
}> = ({ onChange }) => {
  const [currentState, setCurrentState] = useState<NotchState>("inactive");
  const [isMorphing, setIsMorphing] = useState<boolean>(false);

  useEffect(() => onChange?.(currentState), [currentState, onChange]);

  const morphState = (newState: NotchState) => {
    if (currentState !== newState && !isMorphing) {
      setIsMorphing(true);

      setTimeout(() => {
        setCurrentState(newState);
        setTimeout(() => setIsMorphing(false), 300);
      }, 300);
    }
  };

  return  <div>
    {/* The notch container */}
    <div
      style={{
        width: "100px",
        height: "100px",
        backgroundColor: "#232323",
        borderRadius: "10px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* The SVG with animation */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentState}
          initial={isMorphing ? "blurred" : "initial"}
          animate={isMorphing ? "blurred" : "initial"}
          exit="exit"
          variants={blurVariants}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          style={{
            color: "white",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            width: "40px",
            height: "40px",
          }}
        >
          {svgMap[currentState]}
        </motion.div>
      </AnimatePresence>
    </div>
  </div>;
};

export default NotchComponent;
