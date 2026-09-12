import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PhoneNumberInput } from "./phone-number-input";

afterEach(cleanup);

function setup() {
  render(<PhoneNumberInput />);
  return screen.getByRole("textbox") as HTMLInputElement;
}

function caretOf(input: HTMLInputElement): number {
  return input.selectionStart ?? input.value.length;
}

/**
 * Replace the raw DOM value and caret the way the browser does *before* React
 * sees the change event: the component is handed a string that may contain
 * characters it has to reject, and a caret inside it.
 */
function edit(input: HTMLInputElement, raw: string, caret = raw.length) {
  fireEvent.change(input, {
    target: { value: raw, selectionStart: caret, selectionEnd: caret },
  });
}

/** Type `text` one character at a time, starting at `at` (default: the caret). */
function type(input: HTMLInputElement, text: string, at?: number) {
  let caret = at ?? caretOf(input);
  for (const char of text) {
    const { value } = input;
    edit(input, value.slice(0, caret) + char + value.slice(caret), caret + 1);
    caret = caretOf(input);
  }
}

/** Backspace once at `at` (default: the caret). */
function backspace(input: HTMLInputElement, at = caretOf(input)) {
  if (at === 0) return;
  const { value } = input;
  edit(input, value.slice(0, at - 1) + value.slice(at), at - 1);
}

describe("PhoneNumberInput: formatting", () => {
  it("starts empty", () => {
    expect(setup().value).toBe("");
  });

  it("formats progressively, digit by digit", () => {
    const input = setup();
    const steps = [
      "1",
      "12",
      "123",
      "(123)4",
      "(123)45",
      "(123)456",
      "(123)456-7",
      "(123)456-78",
      "(123)456-789",
      "(123)456-7890",
    ];

    for (const [i, expected] of steps.entries()) {
      type(input, String((i + 1) % 10));
      expect(input.value).toBe(expected);
    }
  });

  it("leaves the first three digits unformatted", () => {
    const input = setup();
    type(input, "123");
    expect(input.value).toBe("123");
  });

  it("wraps the area code when the 4th digit arrives", () => {
    const input = setup();
    type(input, "1234");
    expect(input.value).toBe("(123)4");
  });

  it("adds the dash before the 7th digit", () => {
    const input = setup();
    type(input, "1234567");
    expect(input.value).toBe("(123)456-7");
  });

  it("ignores digits past the tenth", () => {
    const input = setup();
    type(input, "12345678901234");
    expect(input.value).toBe("(123)456-7890");
  });
});

describe("PhoneNumberInput: non-digits", () => {
  it("ignores letters as they are typed", () => {
    const input = setup();
    type(input, "1a2b3c4d");
    expect(input.value).toBe("(123)4");
  });

  it("keeps the value formatted when a rejected key is typed", () => {
    const input = setup();
    type(input, "1234");

    type(input, "x");

    expect(input.value).toBe("(123)4"); // not "(123)4x"
  });

  it("never shows the raw keystrokes, only the formatted value", () => {
    const input = setup();
    edit(input, "12a3");
    expect(input.value).toBe("123");
  });

  it("keeps only the digits of a pasted number", () => {
    const input = setup();
    edit(input, "+1 (234) 567-8901");
    expect(input.value).toBe("(123)456-7890");
  });

  it("ignores a paste with no digits in it", () => {
    const input = setup();
    type(input, "123456");

    edit(input, "(123)456hello", 13);

    expect(input.value).toBe("(123)456");
  });
});

describe("PhoneNumberInput: deleting", () => {
  it("drops the parens when the 4th digit goes", () => {
    const input = setup();
    type(input, "1234");

    backspace(input);

    expect(input.value).toBe("123");
  });

  it("drops the dash when the 7th digit goes", () => {
    const input = setup();
    type(input, "1234567");

    backspace(input);

    expect(input.value).toBe("(123)456");
  });

  it("unwinds the whole number, one backspace at a time", () => {
    const input = setup();
    type(input, "1234567890");
    const seen: string[] = [];

    for (let i = 0; i < 10; i += 1) {
      backspace(input);
      seen.push(input.value);
    }

    expect(seen).toEqual([
      "(123)456-789",
      "(123)456-78",
      "(123)456-7",
      "(123)456",
      "(123)45",
      "(123)4",
      "123",
      "12",
      "1",
      "",
    ]);
  });

  it("clears the input when everything is selected and deleted", () => {
    const input = setup();
    type(input, "1234567890");

    edit(input, "");

    expect(input.value).toBe("");
  });

  it("re-formats the digits that are left after a delete in the middle", () => {
    const input = setup();
    type(input, "1234567890");

    backspace(input, 6); // the "4" of "(123)4"

    expect(input.value).toBe("(123)567-890");
  });

  it("leaves the digits alone when a separator is deleted", () => {
    const input = setup();
    type(input, "1234567890");

    backspace(input, 9); // the "-"

    expect(input.value).toBe("(123)456-7890");
  });
});

describe.skip("PhoneNumberInput: the caret", () => {
  it("leaves the caret at the end while typing at the end", () => {
    const input = setup();
    type(input, "1234");
    expect(caretOf(input)).toBe(6);
  });

  it("puts the caret after the typed digit, past punctuation it inserted", () => {
    const input = setup();
    type(input, "123");

    type(input, "4"); // "123" -> "(123)4"

    expect(caretOf(input)).toBe(6);
  });

  it("keeps the caret where the user typed, not at the end", () => {
    const input = setup();
    type(input, "123456");

    type(input, "9", 2); // after the "1" of "(123)456"

    expect(input.value).toBe("(192)345-6");
    expect(caretOf(input)).toBe(3);
  });

  it("keeps the caret in place after a delete in the middle", () => {
    const input = setup();
    type(input, "1234567890");

    backspace(input, 6);

    expect(input.value).toBe("(123)567-890");
    expect(caretOf(input)).toBe(4);
  });

  it("does not move the caret when a non-digit is typed", () => {
    const input = setup();
    type(input, "123456");

    type(input, "a", 2);

    expect(input.value).toBe("(123)456");
    expect(caretOf(input)).toBe(2);
  });

  it("steps the caret back over a deleted separator", () => {
    const input = setup();
    type(input, "1234567890");

    backspace(input, 9); // the "-"

    expect(caretOf(input)).toBe(8);
  });

  it("keeps the caret at the front when typing at the front", () => {
    const input = setup();
    type(input, "1234567890");

    type(input, "9", 0);

    expect(input.value).toBe("(912)345-6789");
    expect(caretOf(input)).toBe(2);
  });

  it("counts only the digits before the caret, not the punctuation", () => {
    const input = setup();
    type(input, "1234567890");

    type(input, "0", 8); // "(123)456|-7890", a digit is dropped off the end

    expect(input.value).toBe("(123)456-0789");
    expect(caretOf(input)).toBe(10);
  });
});
