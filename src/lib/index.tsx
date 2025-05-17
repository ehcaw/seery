import React from "react";

export const svgMap = {
  inactive: (<></>), // purposefully none
  dormant: (
    <></>
  ),
  prompted: (
    <></>
  ),
  thinking: (
    <></>
  ),
  answering: (
    <></>
  ),
};

export const blurVariants = {
  initial: { filter: "blur(0px)" },
  blurred: { filter: "blur(8px)" },
  exit: { filter: "blur(8px)", opacity: 0 },
};
