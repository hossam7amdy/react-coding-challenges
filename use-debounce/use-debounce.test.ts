import {
  act,
  render,
  screen,
  cleanup,
  fireEvent,
  renderHook,
} from "@testing-library/react";
import { createElement, useState, type ChangeEvent } from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

import { useDebounce } from "./use-debounce";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * The distinct values the hook handed back, in order. React may re-render a
 * component once before bailing out of a same-value state update, so raw render
 * counts are not a contract: what the hook *committed* is.
 */
function commits<T>(seen: T[]): T[] {
  return seen.filter((value, i) => i === 0 || !Object.is(value, seen[i - 1]));
}

type Props<T> = { value: T; delay: number };

function renderDebounce<T>(initialProps: Props<T>) {
  const seen: T[] = [];
  const view = renderHook(
    ({ value, delay }: Props<T>) => {
      const debounced = useDebounce(value, delay);
      seen.push(debounced);
      return debounced;
    },
    { initialProps },
  );

  return {
    seen,
    unmount: view.unmount,
    get current() {
      return view.result.current;
    },
    set(props: Props<T>) {
      view.rerender(props);
    },
    advance(ms: number) {
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    },
  };
}

describe("useDebounce: first render", () => {
  it("returns the value immediately, without waiting for the delay", () => {
    const view = renderDebounce({ value: "a", delay: 300 });
    expect(view.current).toBe("a");
  });

  it("hands back the given reference, not a copy of it", () => {
    const value = { q: "a" };
    const view = renderDebounce({ value, delay: 300 });
    expect(view.current).toBe(value);
  });

  it("commits nothing on its own when the value never changes", () => {
    const view = renderDebounce({ value: "a", delay: 300 });
    view.advance(5_000);
    expect(commits(view.seen)).toEqual(["a"]);
  });
});

describe("useDebounce: trailing edge", () => {
  it("holds the previous value until the full delay has elapsed", () => {
    const view = renderDebounce({ value: "a", delay: 300 });

    view.set({ value: "b", delay: 300 });
    view.advance(299);

    expect(view.current).toBe("a");
  });

  it("commits the new value once the delay elapses", () => {
    const view = renderDebounce({ value: "a", delay: 300 });

    view.set({ value: "b", delay: 300 });
    view.advance(300);

    expect(view.current).toBe("b");
    expect(commits(view.seen)).toEqual(["a", "b"]);
  });

  it("does not re-render while the delay is still running", () => {
    const view = renderDebounce({ value: "a", delay: 300 });
    view.set({ value: "b", delay: 300 });
    const rendersSoFar = view.seen.length;

    view.advance(299);

    expect(view.seen.length).toBe(rendersSoFar);
  });

  it("commits only the last value of a burst, exactly once", () => {
    const view = renderDebounce({ value: "a", delay: 300 });

    for (const value of ["b", "c", "d", "e"]) {
      view.set({ value, delay: 300 });
      view.advance(50);
    }
    expect(view.current).toBe("a");

    view.advance(300);
    expect(commits(view.seen)).toEqual(["a", "e"]);
  });

  it("restarts the delay on every change, so continuous edits never commit", () => {
    const view = renderDebounce({ value: 0, delay: 300 });

    for (let next = 1; next <= 10; next += 1) {
      view.set({ value: next, delay: 300 });
      view.advance(299);
      expect(view.current).toBe(0); // 2990ms of edits, still nothing committed
    }

    view.advance(1);
    expect(view.current).toBe(10);
  });

  it("never exposes a value that was replaced before its delay elapsed", () => {
    const view = renderDebounce({ value: "a", delay: 300 });

    view.set({ value: "b", delay: 300 });
    view.advance(100);
    view.set({ value: "a", delay: 300 }); // reverted mid-flight
    view.advance(1_000);

    expect(view.current).toBe("a");
    expect(view.seen).not.toContain("b");
  });
});

describe("useDebounce: re-renders that are not changes", () => {
  it("does not restart the timer when re-rendered with the same value", () => {
    const view = renderDebounce({ value: "a", delay: 300 });

    view.set({ value: "b", delay: 300 });
    view.advance(200);
    view.set({ value: "b", delay: 300 }); // same value: timer must keep running
    view.advance(100);

    expect(view.current).toBe("b");
  });

  it("treats an Object.is-equal value as no change", () => {
    const view = renderDebounce({ value: Number.NaN, delay: 300 });

    view.set({ value: Number.NaN, delay: 300 });
    view.advance(1_000);

    expect(commits(view.seen)).toHaveLength(1);
  });

  it("treats a new object with identical contents as a change", () => {
    const first = { q: "a" };
    const second = { q: "a" };
    const view = renderDebounce({ value: first, delay: 300 });

    view.set({ value: second, delay: 300 });
    view.advance(299);
    expect(view.current).toBe(first);

    view.advance(1);
    expect(view.current).toBe(second);
  });
});

describe("useDebounce: delay", () => {
  it("applies a changed delay to the value already in flight", () => {
    const view = renderDebounce({ value: "a", delay: 500 });

    view.set({ value: "b", delay: 500 });
    view.advance(100);
    view.set({ value: "b", delay: 200 });

    view.advance(199);
    expect(view.current).toBe("a");

    view.advance(1); // 300ms total, well short of the original 500ms
    expect(view.current).toBe("b");
  });

  it("commits on the next timer tick when the delay is 0", () => {
    const view = renderDebounce({ value: "a", delay: 0 });

    view.set({ value: "b", delay: 0 });
    expect(view.current).toBe("a"); // still asynchronous

    view.advance(0);
    expect(view.current).toBe("b");
  });

  it("commits nothing when only the delay changes while idle", () => {
    const view = renderDebounce({ value: "a", delay: 300 });

    view.set({ value: "a", delay: 50 });
    view.advance(1_000);

    expect(commits(view.seen)).toEqual(["a"]);
  });
});

describe("useDebounce: value types", () => {
  it("debounces undefined as a real value", () => {
    const view = renderDebounce<string | undefined>({ value: "a", delay: 300 });

    view.set({ value: undefined, delay: 300 });
    view.advance(300);

    expect(view.current).toBeUndefined();
    expect(commits(view.seen)).toEqual(["a", undefined]);
  });

  it("debounces null and other falsy values", () => {
    const view = renderDebounce<string | null | number | boolean>({
      value: "a",
      delay: 300,
    });

    for (const value of [null, 0, "", false]) {
      view.set({ value, delay: 300 });
      view.advance(300);
      expect(view.current).toBe(value);
    }

    expect(commits(view.seen)).toEqual(["a", null, 0, "", false]);
  });
});

describe("useDebounce: independence", () => {
  it("keeps two hooks in one component on separate timers", () => {
    const { result, rerender } = renderHook(
      ({ a, b }: { a: string; b: string }) => ({
        fast: useDebounce(a, 100),
        slow: useDebounce(b, 400),
      }),
      { initialProps: { a: "a0", b: "b0" } },
    );

    rerender({ a: "a1", b: "b1" });

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toEqual({ fast: "a1", slow: "b0" });

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toEqual({ fast: "a1", slow: "b1" });
  });

  it("keeps two mounted components independent", () => {
    const left = renderDebounce({ value: "l0", delay: 300 });
    const right = renderDebounce({ value: "r0", delay: 300 });

    left.set({ value: "l1", delay: 300 });
    left.advance(300);

    expect(left.current).toBe("l1");
    expect(right.current).toBe("r0");
    expect(commits(right.seen)).toEqual(["r0"]);
  });
});

describe("useDebounce: cleanup", () => {
  it("clears the pending timer on unmount", () => {
    const view = renderDebounce({ value: "a", delay: 300 });

    view.set({ value: "b", delay: 300 });
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not commit or warn after unmount", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = renderDebounce({ value: "a", delay: 300 });

    view.set({ value: "b", delay: 300 });
    view.unmount();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(view.seen).not.toContain("b");
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("leaves no timer pending once a value has settled", () => {
    const view = renderDebounce({ value: "a", delay: 300 });

    view.set({ value: "b", delay: 300 });
    view.advance(300);

    expect(view.current).toBe("b");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("useDebounce: in a real component", () => {
  function SearchBox({ delay }: { delay: number }) {
    const [term, setTerm] = useState("");
    const query = useDebounce(term, delay);

    return createElement(
      "div",
      null,
      createElement("input", {
        "data-testid": "input",
        value: term,
        onChange: (event: ChangeEvent<HTMLInputElement>) =>
          setTerm(event.target.value),
      }),
      createElement("output", { "data-testid": "query" }, query),
    );
  }

  it("holds the query until typing pauses", () => {
    render(createElement(SearchBox, { delay: 300 }));
    const input = screen.getByTestId("input") as HTMLInputElement;

    for (const term of ["r", "re", "rea", "reac", "react"]) {
      fireEvent.change(input, { target: { value: term } });
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(input.value).toBe(term); // the input itself stays responsive
      expect(screen.getByTestId("query").textContent).toBe("");
    }

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId("query").textContent).toBe("react");
  });
});
