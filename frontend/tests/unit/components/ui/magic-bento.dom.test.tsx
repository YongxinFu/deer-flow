import { afterEach, describe, expect, it } from "@rstest/core";
import { act, cleanup, render } from "@testing-library/react";

import MagicBento from "@/components/ui/magic-bento";

const cardData = [{ label: "Label", title: "Title", description: "Description" }];

afterEach(() => {
  cleanup();
});

describe("magic bento card ref lifecycle", () => {
  it("releases the pointer listeners when the inline ref re-attaches", () => {
    const view = render(<MagicBento data={cardData} enableStars={false} />);
    const card = view.container.querySelector<HTMLElement>(".magic-bento-card");
    if (!card) {
      throw new Error("plain bento card did not render");
    }

    const counts = { add: 0, remove: 0 };
    const originalAdd = card.addEventListener.bind(card);
    const originalRemove = card.removeEventListener.bind(card);
    card.addEventListener = ((type: string, listener: never, options?: never) => {
      counts.add += 1;
      return originalAdd(type, listener, options);
    }) as typeof card.addEventListener;
    card.removeEventListener = ((type: string, listener: never, options?: never) => {
      counts.remove += 1;
      return originalRemove(type, listener, options);
    }) as typeof card.removeEventListener;

    // The inline ref callback has a fresh identity on every render, so React
    // detaches (cleanup or null) and re-attaches it. Every re-attach must
    // release the previous three pointer handlers, or they accumulate per
    // re-render and one click fans out one GSAP ripple per stale registration.
    act(() => {
      view.rerender(<MagicBento data={cardData} enableStars={false} />);
    });

    expect(counts.remove).toBe(counts.add);
  });
});
