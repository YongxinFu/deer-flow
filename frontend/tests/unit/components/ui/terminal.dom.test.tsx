
import { afterEach, describe, expect, it, rs } from "@rstest/core";
import { act, cleanup, render } from "@testing-library/react";
import React from "react";

import { TypingAnimation } from "@/components/ui/terminal";

rs.mock("motion/react", () => {
  const makeComponent = (tag: string) => {
    const Component = (props: Record<string, unknown>) =>
      React.createElement(tag, props);
    Component.displayName = tag;
    return Component;
  };
  return {
    motion: { create: (_tag: string) => makeComponent("span") },
    useInView: () => true,
  };
});

afterEach(() => {
  cleanup();
  rs.useRealTimers();
});

describe("typing animation surrogate safety", () => {
  it("only ever reveals whole code points of astral text", () => {
    rs.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    const text = "中文😀tail";
    // Code-point boundaries in UTF-16 units: 😀 spans units 2-3.
    const boundaries = [0, 1, 2, 4, 5, 6, 7, 8];
    const { container } = render(
      <TypingAnimation duration={1} startOnView={false}>
        {text}
      </TypingAnimation>,
    );

    let ticks = 0;
    while (container.textContent !== text && ticks < 50) {
      act(() => {
        rs.advanceTimersByTime(1);
      });
      ticks += 1;
      const displayed = container.textContent ?? "";
      // A revealed prefix must be a code-point prefix of the text; slicing
      // between the two units of 😀 renders one lone surrogate for a tick.
      expect(boundaries).toContain(displayed.length);
    }
    expect(container.textContent).toBe(text);
  });
});
