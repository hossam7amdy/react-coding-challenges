import { describe, it, expect, afterEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  act,
  fireEvent,
} from "@testing-library/react";
import { useState } from "react";
import { proxy, snapshot } from "./proxy";
import { useSnapshot } from "./use-snapshot";

afterEach(cleanup);

describe("useSnapshot: reactivity", () => {
  it("renders current state and re-renders when a read key changes", async () => {
    const state = proxy({ count: 0 });
    let renders = 0;

    function Counter() {
      renders += 1;
      const snap = useSnapshot(state);
      return <div data-testid="v">{snap.count}</div>;
    }

    render(<Counter />);
    expect(screen.getByTestId("v").textContent).toBe("0");
    expect(renders).toBe(1);

    await act(async () => {
      state.count = 1;
    });
    expect(screen.getByTestId("v").textContent).toBe("1");
    expect(renders).toBe(2);
  });

  it("updates when the proxy is mutated from an event handler", async () => {
    const state = proxy({ count: 0 });

    function Counter() {
      const snap = useSnapshot(state);
      return (
        <button type="button" onClick={() => (state.count += 1)}>
          {snap.count}
        </button>
      );
    }

    render(<Counter />);
    fireEvent.click(screen.getByRole("button"));
    await act(async () => {});

    expect(screen.getByRole("button").textContent).toBe("1");
    expect(state.count).toBe(1);
  });

  it("collapses several mutations in one tick into one re-render", async () => {
    const state = proxy({ count: 0 });
    let renders = 0;

    function Counter() {
      renders += 1;
      const snap = useSnapshot(state);
      return <div data-testid="v">{snap.count}</div>;
    }

    render(<Counter />);
    await act(async () => {
      state.count += 1;
      state.count += 1;
      state.count += 1;
    });

    expect(screen.getByTestId("v").textContent).toBe("3");
    expect(renders).toBe(2);
  });

  it("hands back a frozen snapshot that throws on write", () => {
    const state = proxy({ count: 0 });
    let captured: { count: number } | null = null;

    function View() {
      const snap = useSnapshot(state);
      captured = snap as { count: number };
      return <div>{snap.count}</div>;
    }

    render(<View />);
    expect(() => {
      captured!.count = 5;
    }).toThrow();
    expect(state.count).toBe(0);
  });
});

describe("useSnapshot: tracking granularity", () => {
  it("does not re-render when an untouched key changes", async () => {
    const state = proxy({ read: 0, ignored: 0 });
    let renders = 0;

    function View() {
      renders += 1;
      const snap = useSnapshot(state);
      return <div>{snap.read}</div>;
    }

    render(<View />);
    expect(renders).toBe(1);

    await act(async () => {
      state.ignored = 42;
    });
    expect(renders).toBe(1);

    await act(async () => {
      state.read = 1;
    });
    expect(renders).toBe(2);
  });

  it("does not re-render when a read key is set to the same value", async () => {
    const state = proxy({ count: 1 });
    let renders = 0;

    function View() {
      renders += 1;
      const snap = useSnapshot(state);
      return <div>{snap.count}</div>;
    }

    render(<View />);
    await act(async () => {
      state.count = 1;
    });
    expect(renders).toBe(1);
  });

  it("tracks a key that was read while still undefined", async () => {
    const state = proxy<{ a: number; later?: string }>({ a: 1 });
    let renders = 0;

    function View() {
      renders += 1;
      const snap = useSnapshot(state);
      return <div data-testid="v">{snap.later ?? "none"}</div>;
    }

    render(<View />);
    expect(screen.getByTestId("v").textContent).toBe("none");

    await act(async () => {
      state.a = 2; // untouched key
    });
    expect(renders).toBe(1);

    await act(async () => {
      state.later = "here";
    });
    expect(renders).toBe(2);
    expect(screen.getByTestId("v").textContent).toBe("here");
  });

  it("re-renders when a read key is deleted", async () => {
    const state = proxy<{ name?: string }>({ name: "ada" });
    let renders = 0;

    function View() {
      renders += 1;
      const snap = useSnapshot(state);
      return <div data-testid="v">{snap.name ?? "gone"}</div>;
    }

    render(<View />);
    await act(async () => {
      delete state.name;
    });

    expect(renders).toBe(2);
    expect(screen.getByTestId("v").textContent).toBe("gone");
  });

  it("resets tracking every render, so a conditionally read key stops counting", async () => {
    const state = proxy({ show: false, detail: "a" });
    let renders = 0;

    function View() {
      renders += 1;
      const snap = useSnapshot(state);
      return <div data-testid="v">{snap.show ? snap.detail : "hidden"}</div>;
    }

    render(<View />);
    expect(screen.getByTestId("v").textContent).toBe("hidden");

    // `detail` was never read on this render: invisible to this component.
    await act(async () => {
      state.detail = "b";
    });
    expect(renders).toBe(1);

    await act(async () => {
      state.show = true;
    });
    expect(renders).toBe(2);
    expect(screen.getByTestId("v").textContent).toBe("b");

    // Now `detail` IS read, so it must be tracked from here on.
    await act(async () => {
      state.detail = "c";
    });
    expect(renders).toBe(3);
    expect(screen.getByTestId("v").textContent).toBe("c");
  });

  it("treats key enumeration as a read of the key set, not of the values", async () => {
    const state = proxy<Record<string, number>>({ a: 1 });
    let renders = 0;

    function View() {
      renders += 1;
      const snap = useSnapshot(state);
      return <div data-testid="v">{Object.keys(snap).join(",")}</div>;
    }

    render(<View />);
    expect(screen.getByTestId("v").textContent).toBe("a");

    // Value changed, key set did not.
    await act(async () => {
      state.a = 2;
    });
    expect(renders).toBe(1);

    await act(async () => {
      state.b = 3;
    });
    expect(renders).toBe(2);
    expect(screen.getByTestId("v").textContent).toBe("a,b");

    await act(async () => {
      delete state.b;
    });
    expect(renders).toBe(3);
  });

  it("re-renders only the component that read the changed key", async () => {
    const state = proxy({ a: 0, b: 0 });
    let aRenders = 0;
    let bRenders = 0;

    function A() {
      aRenders += 1;
      const snap = useSnapshot(state);
      return <div>{snap.a}</div>;
    }
    function B() {
      bRenders += 1;
      const snap = useSnapshot(state);
      return <div>{snap.b}</div>;
    }

    render(
      <>
        <A />
        <B />
      </>,
    );

    await act(async () => {
      state.a = 1;
    });
    expect(aRenders).toBe(2);
    expect(bRenders).toBe(1);
  });

  it("handles two independent proxies in one component", async () => {
    const left = proxy({ n: 0 });
    const right = proxy({ n: 0 });
    let renders = 0;

    function View() {
      renders += 1;
      const l = useSnapshot(left);
      const r = useSnapshot(right);
      return <div data-testid="v">{`${l.n}-${r.n}`}</div>;
    }

    render(<View />);
    await act(async () => {
      right.n = 5;
    });

    expect(renders).toBe(2);
    expect(screen.getByTestId("v").textContent).toBe("0-5");
  });

  it("keeps tracking correct across a re-render caused by local state", async () => {
    const state = proxy({ tracked: 0, ignored: 0 });
    let renders = 0;
    let bump: () => void = () => {};

    function View() {
      renders += 1;
      const [local, setLocal] = useState(0);
      bump = () => setLocal((n) => n + 1);
      const snap = useSnapshot(state);
      return <div data-testid="v">{`${snap.tracked}-${local}`}</div>;
    }

    render(<View />);
    await act(async () => {
      bump();
    });
    expect(renders).toBe(2);

    // A local re-render must not widen or lose proxy tracking.
    await act(async () => {
      state.ignored = 1;
    });
    expect(renders).toBe(2);

    await act(async () => {
      state.tracked = 1;
    });
    expect(renders).toBe(3);
    expect(screen.getByTestId("v").textContent).toBe("1-1");
  });
});

describe("useSnapshot: lifecycle", () => {
  it("unsubscribes on unmount", async () => {
    const state = proxy({ count: 0 });
    let renders = 0;
    const onError = vi.fn();

    function View() {
      renders += 1;
      const snap = useSnapshot(state);
      return <div>{snap.count}</div>;
    }

    const { unmount } = render(<View />);
    unmount();

    window.addEventListener("error", onError);
    await act(async () => {
      state.count = 1;
      state.count = 2;
    });
    window.removeEventListener("error", onError);

    expect(renders).toBe(1);
    expect(onError).not.toHaveBeenCalled();
    expect(snapshot(state).count).toBe(2);
  });

  it("picks up a mutation that lands between render and subscription", async () => {
    const state = proxy({ count: 0 });

    function View() {
      const snap = useSnapshot(state);
      return <div data-testid="v">{snap.count}</div>;
    }

    await act(async () => {
      render(<View />);
      state.count = 7;
    });

    expect(screen.getByTestId("v").textContent).toBe("7");
  });

  it("does not tear across components mounted at different times", async () => {
    const state = proxy({ count: 0 });

    function View({ id }: { id: string }) {
      const snap = useSnapshot(state);
      return <div data-testid={id}>{snap.count}</div>;
    }

    render(<View id="first" />);
    await act(async () => {
      state.count = 1;
    });
    render(<View id="second" />);
    await act(async () => {
      state.count = 2;
    });

    expect(screen.getByTestId("first").textContent).toBe("2");
    expect(screen.getByTestId("second").textContent).toBe("2");
  });
});
