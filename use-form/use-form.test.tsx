import {
  act,
  cleanup,
  configure,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import { useForm as useFormUnderTest, type UseFormReturn } from "./use-form";

configure({ reactStrictMode: true });

// An update loop would hang the whole run inside act(), so fail the test instead.
let renders = 0;

const useForm: typeof useFormUnderTest = (options) => {
  if (++renders > 1000) throw new Error("useForm keeps re-rendering");
  return useFormUnderTest(options);
};

// React reports bad input values (NaN, null, controlled <-> uncontrolled) and
// state updates outside act() through console.error, so any call fails the test.
let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  renders = 0;
  consoleError = vi.spyOn(console, "error");
});

afterEach(({ task }) => {
  cleanup();
  const calls = [...consoleError.mock.calls];
  consoleError.mockRestore();
  // A test that already failed would only report the same error twice.
  if (task.result?.state !== "fail") {
    expect(calls, "console.error was called").toEqual([]);
  }
});

/**
 * Renders `fields` against a real `useForm` and exposes its latest return
 * value, like `renderHook` but with inputs to type into.
 */
function renderForm<T extends Record<string, unknown>>(
  initialValues: T,
  fields: (form: UseFormReturn<T>) => ReactNode,
) {
  const result = { current: undefined as unknown as UseFormReturn<T> };
  // What each committed render returned, oldest first.
  const commits: UseFormReturn<T>[] = [];

  function Form({ initialValues }: { initialValues: T }) {
    const form = useForm({ initialValues });
    useEffect(() => {
      result.current = form;
      commits.push(form);
    });
    return fields(form);
  }

  const user = userEvent.setup();
  const view = render(<Form initialValues={initialValues} />);
  /** Re-renders with new initial values, like a parent whose query resolved. */
  const rerender = (next: T) => view.rerender(<Form initialValues={next} />);
  return { result, user, commits, rerender };
}

/**
 * The names a `touched` or `dirty` map flags, sorted. Whether an untouched or
 * clean field is `false` or missing is up to you.
 */
const flagged = (map: Partial<Record<string, boolean>>) =>
  Object.keys(map)
    .filter((name) => map[name])
    .sort();

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Lets a pending `onSubmit` finish inside act(), so its state updates land. */
async function settle(pending: Deferred) {
  await act(async () => {
    pending.resolve();
    await pending.promise;
  });
}

const textbox = (name: string) =>
  screen.getByRole<HTMLInputElement>("textbox", { name });
const spinbutton = (name: string) =>
  screen.getByRole<HTMLInputElement>("spinbutton", { name });
const checkbox = (name: string) =>
  screen.getByRole<HTMLInputElement>("checkbox", { name });
const radio = (name: string) =>
  screen.getByRole<HTMLInputElement>("radio", { name });
const combobox = (name: string) =>
  screen.getByRole<HTMLSelectElement>("combobox", { name });
const listbox = (name: string) =>
  screen.getByRole<HTMLSelectElement>("listbox", { name });
const selected = (select: HTMLSelectElement) =>
  Array.from(select.selectedOptions, (option) => option.value);

type Name = { first: string; last: string };

const nameFields = ({
  values,
  handleChange,
  handleBlur,
}: UseFormReturn<Name>) => (
  <>
    <input
      aria-label="First"
      name="first"
      value={values.first}
      onChange={handleChange}
      onBlur={handleBlur}
    />
    <input
      aria-label="Last"
      name="last"
      value={values.last}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  </>
);

// What an empty number field holds is up to you, so `?? ""` covers the usual
// choices (null, undefined, "") when it goes back into the input.
const ageField = ({ values, handleChange }: UseFormReturn<{ age: number }>) => (
  <input
    type="number"
    aria-label="Age"
    name="age"
    value={values.age ?? ""}
    onChange={handleChange}
  />
);

type AllFields = {
  name: string;
  bio: string;
  age: number;
  subscribe: boolean;
  plan: string;
  country: string;
  toppings: string[];
};

const blankFields: AllFields = {
  name: "",
  bio: "",
  age: 30,
  subscribe: false,
  plan: "free",
  country: "eg",
  toppings: [],
};

/** One input of every type, wired only through `register`. */
const allFields = ({ register }: UseFormReturn<AllFields>) => (
  <>
    <input aria-label="Name" {...register("name")} />
    <textarea aria-label="Bio" {...register("bio")} />
    <input type="number" aria-label="Age" {...register("age")} />
    <input
      type="checkbox"
      aria-label="Subscribe"
      {...register("subscribe", { type: "checkbox" })}
    />
    <input
      type="radio"
      aria-label="free"
      {...register("plan", { type: "radio", value: "free" })}
    />
    <input
      type="radio"
      aria-label="pro"
      {...register("plan", { type: "radio", value: "pro" })}
    />
    <select aria-label="Country" {...register("country")}>
      <option value="eg">Egypt</option>
      <option value="se">Sweden</option>
    </select>
    <select multiple aria-label="Toppings" {...register("toppings")}>
      <option value="cheese">Cheese</option>
      <option value="olives">Olives</option>
    </select>
  </>
);

/**
 * Reads `allFields` back off the screen. The DOM is what the user sees, so a
 * field that's right in `values` but wrong here is still a bug.
 */
const allFieldsOnScreen = (): AllFields => ({
  name: textbox("Name").value,
  bio: textbox("Bio").value,
  age: spinbutton("Age").valueAsNumber,
  subscribe: checkbox("Subscribe").checked,
  plan: ["free", "pro"].find((plan) => radio(plan).checked) ?? "",
  country: combobox("Country").value,
  toppings: selected(listbox("Toppings")),
});

describe("text fields", () => {
  it("shows the initial values", () => {
    renderForm({ first: "Ada", last: "Lovelace" }, nameFields);

    expect(textbox("First").value).toBe("Ada");
    expect(textbox("Last").value).toBe("Lovelace");
  });

  it("updates two inputs independently through one handleChange", async () => {
    const { result, user } = renderForm({ first: "", last: "" }, nameFields);

    await user.type(textbox("First"), "Ada");
    await user.type(textbox("Last"), "Lovelace");

    expect(result.current.values).toEqual({ first: "Ada", last: "Lovelace" });
    expect(textbox("First").value).toBe("Ada");
    expect(textbox("Last").value).toBe("Lovelace");
  });

  it("handles a textarea with the same handleChange", async () => {
    const { result, user } = renderForm(
      { bio: "" },
      ({ values, handleChange }) => (
        <textarea
          aria-label="Bio"
          name="bio"
          value={values.bio}
          onChange={handleChange}
        />
      ),
    );

    await user.type(textbox("Bio"), "Wrote the first program");

    expect(result.current.values.bio).toBe("Wrote the first program");
  });
});

describe("all input types", () => {
  it("stores a checkbox as a boolean", async () => {
    const { result, user } = renderForm(
      { subscribe: false },
      ({ values, handleChange }) => (
        <input
          type="checkbox"
          aria-label="Subscribe"
          name="subscribe"
          checked={values.subscribe}
          onChange={handleChange}
        />
      ),
    );

    await user.click(checkbox("Subscribe"));
    expect(result.current.values.subscribe).toBe(true);
    expect(checkbox("Subscribe").checked).toBe(true);

    await user.click(checkbox("Subscribe"));
    expect(result.current.values.subscribe).toBe(false);
    expect(checkbox("Subscribe").checked).toBe(false);
  });

  it("stores the value of the chosen radio", async () => {
    const { result, user } = renderForm(
      { plan: "free" },
      ({ values, handleChange }) =>
        ["free", "pro", "team"].map((plan) => (
          <input
            key={plan}
            type="radio"
            aria-label={plan}
            name="plan"
            value={plan}
            checked={values.plan === plan}
            onChange={handleChange}
          />
        )),
    );

    await user.click(radio("pro"));

    expect(result.current.values.plan).toBe("pro");
    expect(radio("pro").checked).toBe(true);
    expect(radio("free").checked).toBe(false);
  });

  it("stores the selected option of a select", async () => {
    const { result, user } = renderForm(
      { country: "eg" },
      ({ values, handleChange }) => (
        <select
          aria-label="Country"
          name="country"
          value={values.country}
          onChange={handleChange}
        >
          <option value="eg">Egypt</option>
          <option value="se">Sweden</option>
        </select>
      ),
    );

    await user.selectOptions(combobox("Country"), "se");

    expect(result.current.values.country).toBe("se");
    expect(combobox("Country").value).toBe("se");
  });

  it("stores a multi-select as an array of every selected option", async () => {
    const { result, user } = renderForm(
      { toppings: ["cheese"] },
      ({ values, handleChange }) => (
        <select
          multiple
          aria-label="Toppings"
          name="toppings"
          value={values.toppings}
          onChange={handleChange}
        >
          <option value="cheese">Cheese</option>
          <option value="olives">Olives</option>
          <option value="peppers">Peppers</option>
        </select>
      ),
    );

    await user.selectOptions(listbox("Toppings"), ["olives", "peppers"]);
    expect(result.current.values.toppings).toEqual([
      "cheese",
      "olives",
      "peppers",
    ]);

    await user.deselectOptions(listbox("Toppings"), "cheese");
    expect(result.current.values.toppings).toEqual(["olives", "peppers"]);
    expect(selected(listbox("Toppings"))).toEqual(["olives", "peppers"]);
  });

  it("stores a number input as a number", async () => {
    const { result, user } = renderForm({ age: 30 }, ageField);

    await user.clear(spinbutton("Age"));
    await user.type(spinbutton("Age"), "36.5");

    expect(result.current.values.age).toBe(36.5);
  });

  it("keeps an empty number input empty instead of turning it into 0", async () => {
    const { result, user } = renderForm({ age: 30 }, ageField);

    await user.clear(spinbutton("Age"));

    expect(result.current.values.age).not.toBe(0);
    expect(result.current.values.age).not.toBeNaN();
    expect(spinbutton("Age").value).toBe("");

    await user.type(spinbutton("Age"), "0");

    expect(result.current.values.age).toBe(0);
  });
});

describe("register", () => {
  it("returns name, value, onChange and onBlur", () => {
    const { result } = renderHook(() =>
      useForm({ initialValues: { email: "ada@example.com" } }),
    );

    expect(result.current.register("email")).toMatchObject({
      name: "email",
      value: "ada@example.com",
      onChange: expect.any(Function),
      onBlur: expect.any(Function),
    });
  });

  // React warns about a given input problem once per run, so this test runs
  // before the bigger form below that would hit the same warning.
  it("keeps a cleared number field controlled", async () => {
    const { user } = renderForm({ age: 30 }, ({ register }) => (
      <input type="number" aria-label="Age" {...register("age")} />
    ));

    await user.clear(spinbutton("Age"));

    // An undefined or null `value` here makes React warn, which fails the test.
    expect(spinbutton("Age").value).toBe("");
  });

  it("shows the initial value of every registered input", () => {
    const initialValues: AllFields = {
      name: "Ada",
      bio: "Countess",
      age: 36,
      subscribe: true,
      plan: "pro",
      country: "se",
      toppings: ["olives"],
    };
    renderForm(initialValues, allFields);

    expect(allFieldsOnScreen()).toEqual(initialValues);
  });

  it("wires every input type with no props written by hand", async () => {
    const { result, user } = renderForm(blankFields, allFields);

    await user.type(textbox("Name"), "Ada");
    await user.type(textbox("Bio"), "Countess");
    await user.clear(spinbutton("Age"));
    await user.type(spinbutton("Age"), "36");
    await user.click(checkbox("Subscribe"));
    await user.click(radio("pro"));
    await user.selectOptions(combobox("Country"), "se");
    await user.selectOptions(listbox("Toppings"), ["cheese", "olives"]);

    expect(result.current.values).toEqual({
      name: "Ada",
      bio: "Countess",
      age: 36,
      subscribe: true,
      plan: "pro",
      country: "se",
      toppings: ["cheese", "olives"],
    });
    expect(allFieldsOnScreen()).toEqual(result.current.values);
  });

  it("fails loudly on a name that isn't in the form", () => {
    const { result } = renderHook(() =>
      useForm({ initialValues: { email: "" } }),
    );
    // The compiler catches typos in literals; names that arrive at runtime
    // get past it.
    const fromServer: string = "emial";

    expect(() => result.current.register(fromServer as "email")).toThrow(
      /emial/,
    );
  });
});

describe("programmatic control", () => {
  it("setFieldValue changes one field and keeps the rest", () => {
    const { result } = renderHook(() =>
      useForm({ initialValues: { first: "Ada", last: "Lovelace" } }),
    );

    act(() => result.current.setFieldValue("first", "Augusta"));

    expect(result.current.values).toEqual({
      first: "Augusta",
      last: "Lovelace",
    });
  });

  it("keeps both changes when setFieldValue runs twice in one tick", () => {
    const { result } = renderHook(() =>
      useForm({ initialValues: { first: "Ada", last: "Lovelace" } }),
    );

    act(() => {
      result.current.setFieldValue("first", "Grace");
      result.current.setFieldValue("last", "Hopper");
    });

    expect(result.current.values).toEqual({ first: "Grace", last: "Hopper" });
  });

  it("setValues replaces every value", () => {
    const { result } = renderHook(() =>
      useForm({ initialValues: { first: "Ada", last: "Lovelace" } }),
    );

    act(() => result.current.setValues({ first: "Grace", last: "Hopper" }));

    expect(result.current.values).toEqual({ first: "Grace", last: "Hopper" });
  });

  it("reset restores the initial values after typing and setFieldValue", async () => {
    const { result, user } = renderForm(
      { first: "Ada", last: "Lovelace" },
      nameFields,
    );

    await user.clear(textbox("First"));
    await user.type(textbox("First"), "Grace");
    act(() => result.current.setFieldValue("last", "Hopper"));
    act(() => result.current.reset());

    expect(result.current.values).toEqual({ first: "Ada", last: "Lovelace" });
    expect(textbox("First").value).toBe("Ada");
    expect(textbox("Last").value).toBe("Lovelace");
  });

  it("reset works when passed straight to a button's onClick", async () => {
    const { result, user } = renderForm(
      { first: "Ada", last: "Lovelace" },
      (form) => (
        <>
          {nameFields(form)}
          <button type="button" onClick={form.reset}>
            Reset
          </button>
        </>
      ),
    );

    await user.type(textbox("First"), " King");
    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(result.current.values).toEqual({ first: "Ada", last: "Lovelace" });
  });

  it("setValues shows up in every registered input", () => {
    const { result } = renderForm(blankFields, allFields);
    const next: AllFields = {
      name: "Grace",
      bio: "Admiral",
      age: 85,
      subscribe: true,
      plan: "pro",
      country: "se",
      toppings: ["cheese"],
    };

    act(() => result.current.setValues(next));

    expect(allFieldsOnScreen()).toEqual(next);
  });

  it("reset puts every registered input back the way it started", async () => {
    const { result, user } = renderForm(blankFields, allFields);

    await user.type(textbox("Name"), "Ada");
    await user.type(textbox("Bio"), "Countess");
    await user.type(spinbutton("Age"), "6");
    await user.click(checkbox("Subscribe"));
    await user.click(radio("pro"));
    await user.selectOptions(combobox("Country"), "se");
    await user.selectOptions(listbox("Toppings"), "olives");
    act(() => result.current.reset());

    expect(result.current.values).toEqual(blankFields);
    expect(allFieldsOnScreen()).toEqual(blankFields);
  });

  it("never mutates the initialValues object", () => {
    const initialValues = { first: "Ada", last: "Lovelace" };
    const { result } = renderHook(() => useForm({ initialValues }));

    act(() => result.current.setFieldValue("first", "Grace"));
    expect(initialValues).toEqual({ first: "Ada", last: "Lovelace" });

    act(() => result.current.reset());
    expect(result.current.values).toEqual({ first: "Ada", last: "Lovelace" });
  });

  it("keeps a Date in one field a Date when another field changes", () => {
    const { result } = renderHook(() =>
      useForm({
        initialValues: { name: "Ada", born: new Date("1815-12-10") },
      }),
    );

    act(() => result.current.setFieldValue("name", "Grace"));

    expect(result.current.values.born).toEqual(new Date("1815-12-10"));
  });
});

describe("submission", () => {
  type SignUp = { email: string };
  type Submit = (values: SignUp) => void | Promise<void>;

  function renderSignUp(onSubmit: Submit) {
    return renderForm<SignUp>(
      { email: "" },
      ({ register, handleSubmit, isSubmitting }) => (
        <form aria-label="Sign up" onSubmit={handleSubmit(onSubmit)}>
          <input aria-label="Email" {...register("email")} />
          <button type="submit">{isSubmitting ? "Saving…" : "Save"}</button>
        </form>
      ),
    );
  }

  const saveButton = () => screen.getByRole("button");

  it("passes the current values to onSubmit", async () => {
    const pending = deferred();
    const onSubmit = vi.fn<Submit>(() => pending.promise);
    const { user } = renderSignUp(onSubmit);

    await user.type(textbox("Email"), "ada@example.com");
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({ email: "ada@example.com" });
    await settle(pending);
  });

  // A "Save as draft" button: change a field, then submit, in one click.
  it("submits a value set earlier in the same click", async () => {
    type Post = { title: string; status: string };
    const onSubmit = vi.fn<(values: Post) => void>();
    const { user } = renderForm<Post>(
      { title: "Hello", status: "published" },
      ({ setFieldValue, handleSubmit }) => (
        <button
          type="button"
          onClick={() => {
            setFieldValue("status", "draft");
            void handleSubmit(onSubmit)();
          }}
        >
          Save as draft
        </button>
      ),
    );

    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({
      title: "Hello",
      status: "draft",
    });
  });

  it("submits a value a child component sets when it mounts", async () => {
    type Address = { street: string; country: string };
    function DefaultCountry({
      setFieldValue,
    }: Pick<UseFormReturn<Address>, "setFieldValue">) {
      useEffect(() => setFieldValue("country", "eg"), [setFieldValue]);
      return null;
    }
    const onSubmit = vi.fn<(values: Address) => void>();
    const { result } = renderForm<Address>(
      { street: "Baker Street", country: "" },
      ({ setFieldValue }) => <DefaultCountry setFieldValue={setFieldValue} />,
    );

    await act(() => result.current.handleSubmit(onSubmit)());

    expect(onSubmit).toHaveBeenCalledWith({
      street: "Baker Street",
      country: "eg",
    });
  });

  it("stops the browser's own form submission", async () => {
    const pending = deferred();
    renderSignUp(() => pending.promise);

    const notCancelled = fireEvent.submit(
      screen.getByRole("form", { name: "Sign up" }),
    );

    expect(notCancelled).toBe(false);
    await settle(pending);
  });

  it("is submitting until an async onSubmit settles", async () => {
    const pending = deferred();
    const { result, user } = renderSignUp(() => pending.promise);
    expect(result.current.isSubmitting).toBe(false);

    await user.click(saveButton());

    expect(result.current.isSubmitting).toBe(true);
    expect(saveButton().textContent).toBe("Saving…");

    await settle(pending);

    expect(result.current.isSubmitting).toBe(false);
    expect(saveButton().textContent).toBe("Save");
  });

  it("counts every submit in submitCount", async () => {
    const { result } = renderHook(() =>
      useForm({ initialValues: { email: "" } }),
    );
    expect(result.current.submitCount).toBe(0);

    await act(() => result.current.handleSubmit(() => {})());
    await act(() => result.current.handleSubmit(() => {})());

    expect(result.current.submitCount).toBe(2);
    expect(result.current.isSubmitting).toBe(false);
  });

  it("sends one request when submit is double-clicked", async () => {
    const pending = deferred();
    const onSubmit = vi.fn<Submit>(() => pending.promise);
    const { user } = renderSignUp(onSubmit);

    await user.dblClick(saveButton());
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await settle(pending);
    await user.click(saveButton());
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("sends one request when two submits land in the same tick", async () => {
    const pending = deferred();
    const onSubmit = vi.fn<Submit>(() => pending.promise);
    renderSignUp(onSubmit);
    const form = screen.getByRole("form", { name: "Sign up" });

    // Both events reach the handler before React re-renders.
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    await settle(pending);
  });

  it("submits the current values once when initialValues is a new object on every render", async () => {
    const pending = deferred();
    const onSubmit = vi.fn<Submit>(() => pending.promise);
    const { result } = renderHook(() =>
      useForm({ initialValues: { email: "" } }),
    );

    act(() => result.current.setFieldValue("email", "ada@example.com"));
    await act(async () => {
      void result.current.handleSubmit(onSubmit)();
    });
    await act(async () => {
      void result.current.handleSubmit(onSubmit)();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ email: "ada@example.com" });
    await settle(pending);
  });

  it("recovers when onSubmit throws", async () => {
    const { result } = renderHook(() =>
      useForm({ initialValues: { email: "" } }),
    );
    const onSubmit = vi.fn(async () => {
      throw new Error("Network down");
    });

    // Whether handleSubmit rethrows is up to you; either way the form must be
    // usable again.
    await act(() =>
      result.current
        .handleSubmit(onSubmit)()
        .catch(() => {}),
    );
    await act(() =>
      result.current
        .handleSubmit(onSubmit)()
        .catch(() => {}),
    );

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(result.current.isSubmitting).toBe(false);
    // Logging this failure is fine too, but any other error still fails the
    // test.
    for (const args of consoleError.mock.calls) {
      expect(args.map(String).join(" ")).toMatch(/Network down/);
    }
    consoleError.mockClear();
  });

  it("reset clears the submit count along with the values", async () => {
    const { result } = renderHook(() =>
      useForm({ initialValues: { email: "" } }),
    );

    act(() => result.current.setFieldValue("email", "ada@example.com"));
    await act(() => result.current.handleSubmit(() => {})());
    expect(result.current.submitCount).toBe(1);

    act(() => result.current.reset());

    expect(result.current.values).toEqual({ email: "" });
    expect(result.current.submitCount).toBe(0);
    expect(result.current.isSubmitting).toBe(false);
  });
});

describe("touched", () => {
  it("touches a field when it's left, not when it's focused or typed in", async () => {
    const { result, user } = renderForm(
      { first: "Ada", last: "Lovelace" },
      nameFields,
    );
    expect(flagged(result.current.touched)).toEqual([]);

    await user.type(textbox("First"), " King");
    expect(flagged(result.current.touched)).toEqual([]);

    await user.tab();
    expect(flagged(result.current.touched)).toEqual(["first"]);
  });

  it("touches every registered input type when it loses focus", async () => {
    const { result, user } = renderForm(blankFields, allFields);

    await user.tab();
    while (document.activeElement !== document.body) await user.tab();

    expect(flagged(result.current.touched)).toEqual(
      Object.keys(blankFields).sort(),
    );
  });

  it("leaves a visited field clean and a field set from code untouched", async () => {
    const { result, user } = renderForm(
      { first: "Ada", last: "Lovelace" },
      nameFields,
    );

    await user.click(textbox("First"));
    await user.tab();
    act(() => result.current.setFieldValue("last", "Byron"));

    expect(flagged(result.current.touched)).toEqual(["first"]);
    expect(flagged(result.current.dirty)).toEqual(["last"]);
  });

  it("reset clears touched and dirty", async () => {
    const { result, user } = renderForm(
      { first: "Ada", last: "Lovelace" },
      nameFields,
    );

    await user.type(textbox("First"), " King");
    await user.tab();
    act(() => result.current.reset());

    expect(flagged(result.current.touched)).toEqual([]);
    expect(flagged(result.current.dirty)).toEqual([]);
    expect(result.current.isDirty).toBe(false);
  });

  it("keeps the same values object when a field is touched", async () => {
    const { result, user } = renderForm(
      { first: "Ada", last: "Lovelace" },
      nameFields,
    );
    const values = result.current.values;

    await user.click(textbox("First"));
    await user.tab();

    expect(flagged(result.current.touched)).toEqual(["first"]);
    expect(result.current.values).toBe(values);
  });
});

describe("dirty", () => {
  it("tracks each field and the whole form, clean again once typed back", async () => {
    const { result, user } = renderForm(
      { first: "Ada", last: "Lovelace" },
      nameFields,
    );
    expect(flagged(result.current.dirty)).toEqual([]);
    expect(result.current.isDirty).toBe(false);

    await user.type(textbox("First"), "!");
    await user.type(textbox("Last"), "!");
    expect(flagged(result.current.dirty)).toEqual(["first", "last"]);

    await user.type(textbox("First"), "{Backspace}");
    expect(flagged(result.current.dirty)).toEqual(["last"]);
    expect(result.current.isDirty).toBe(true);

    await user.type(textbox("Last"), "{Backspace}");
    expect(flagged(result.current.dirty)).toEqual([]);
    expect(result.current.isDirty).toBe(false);
  });

  it("is clean again once number, checkbox, radio and select fields are changed back", async () => {
    const { result, user } = renderForm(blankFields, allFields);

    await user.clear(spinbutton("Age"));
    await user.click(checkbox("Subscribe"));
    await user.click(radio("pro"));
    await user.selectOptions(combobox("Country"), "se");
    await user.selectOptions(listbox("Toppings"), "olives");
    expect(flagged(result.current.dirty)).toEqual([
      "age",
      "country",
      "plan",
      "subscribe",
      "toppings",
    ]);

    await user.type(spinbutton("Age"), "30");
    await user.click(checkbox("Subscribe"));
    await user.click(radio("free"));
    await user.selectOptions(combobox("Country"), "eg");
    await user.deselectOptions(listbox("Toppings"), "olives");
    expect(flagged(result.current.dirty)).toEqual([]);
    expect(result.current.isDirty).toBe(false);
  });

  it("compares arrays item by item, not by length", async () => {
    const { result, user } = renderForm(
      { toppings: ["cheese"] },
      ({ register }) => (
        <select multiple aria-label="Toppings" {...register("toppings")}>
          <option value="cheese">Cheese</option>
          <option value="olives">Olives</option>
        </select>
      ),
    );

    await user.selectOptions(listbox("Toppings"), "olives");
    await user.deselectOptions(listbox("Toppings"), "cheese");
    expect(result.current.values.toppings).toEqual(["olives"]);
    expect(flagged(result.current.dirty)).toEqual(["toppings"]);

    await user.selectOptions(listbox("Toppings"), "cheese");
    await user.deselectOptions(listbox("Toppings"), "olives");
    expect(flagged(result.current.dirty)).toEqual([]);
  });

  it("compares dates to the millisecond, not by reference", () => {
    const { result } = renderHook(() =>
      useForm({
        initialValues: { born: new Date("1815-12-10T00:00:00.000Z") },
      }),
    );

    act(() =>
      result.current.setFieldValue(
        "born",
        new Date("1815-12-10T00:00:00.001Z"),
      ),
    );
    expect(flagged(result.current.dirty)).toEqual(["born"]);

    act(() =>
      result.current.setFieldValue(
        "born",
        new Date("1815-12-10T00:00:00.000Z"),
      ),
    );
    expect(flagged(result.current.dirty)).toEqual([]);
  });

  it("treats an invalid initial date as clean", () => {
    const { result } = renderHook(() =>
      useForm({ initialValues: { born: new Date("not a date") } }),
    );

    expect(flagged(result.current.dirty)).toEqual([]);
  });

  it("treats a null initial value as clean", () => {
    const { result } = renderHook(() =>
      useForm({
        initialValues: { name: "Ada", middleName: null as string | null },
      }),
    );

    act(() => result.current.setFieldValue("name", "Grace"));

    expect(flagged(result.current.dirty)).toEqual(["name"]);
  });

  it("setValues re-checks every field against the initial values", async () => {
    const { result, user } = renderForm(
      { first: "Ada", last: "Lovelace" },
      nameFields,
    );

    await user.type(textbox("First"), "!");
    act(() => result.current.setValues({ first: "Ada", last: "Byron" }));

    expect(flagged(result.current.dirty)).toEqual(["last"]);
  });

  it("updates isDirty in the same render as the values", async () => {
    const { user, commits } = renderForm(
      { first: "Ada", last: "Lovelace" },
      nameFields,
    );

    await user.type(textbox("First"), "!{Backspace}");

    expect(commits.length).toBeGreaterThan(2);
    for (const { values, isDirty } of commits) {
      expect(isDirty).toBe(values.first !== "Ada");
    }
  });
});

describe("late initial values", () => {
  const loaded: AllFields = {
    name: "Ada",
    bio: "Countess",
    age: 36,
    subscribe: true,
    plan: "pro",
    country: "se",
    toppings: ["olives"],
  };

  it("loads data that arrives after mount without any render reporting it dirty", () => {
    const { result, commits, rerender } = renderForm(blankFields, allFields);

    rerender(loaded);

    expect(result.current.values).toEqual(loaded);
    expect(allFieldsOnScreen()).toEqual(loaded);
    expect(commits.map((form) => form.isDirty)).not.toContain(true);
  });

  it("keeps unsaved edits through a refetch and refreshes every clean field", async () => {
    const { result, user, rerender } = renderForm(loaded, allFields);

    await user.type(textbox("Name"), " King");
    await user.selectOptions(listbox("Toppings"), "cheese");
    await user.deselectOptions(listbox("Toppings"), "cheese");

    rerender({
      name: "Augusta",
      bio: "Mathematician",
      age: 37,
      subscribe: false,
      plan: "free",
      country: "eg",
      toppings: [],
    });

    const expected: AllFields = {
      name: "Ada King",
      bio: "Mathematician",
      age: 37,
      subscribe: false,
      plan: "free",
      country: "eg",
      toppings: [],
    };
    expect(result.current.values).toEqual(expected);
    expect(allFieldsOnScreen()).toEqual(expected);
    expect(flagged(result.current.dirty)).toEqual(["name"]);
  });

  it("reset goes back to the latest initial values", async () => {
    const { result, user, rerender } = renderForm(
      { first: "", last: "" },
      nameFields,
    );
    rerender({ first: "Ada", last: "Lovelace" });

    await user.type(textbox("Last"), " Byron");
    act(() => result.current.reset());

    expect(result.current.values).toEqual({ first: "Ada", last: "Lovelace" });
  });

  it("submits the loaded data and is clean once the saved data is refetched", async () => {
    const { result, user, rerender } = renderForm(
      { first: "", last: "" },
      nameFields,
    );
    rerender({ first: "Ada", last: "Lovelace" });
    await user.clear(textbox("Last"));
    await user.type(textbox("Last"), "Byron");

    const onSubmit = vi.fn<(values: Name) => void>();
    await act(() => result.current.handleSubmit(onSubmit)());
    expect(onSubmit).toHaveBeenCalledWith({ first: "Ada", last: "Byron" });

    rerender({ first: "Ada", last: "Byron" });
    expect(result.current.values).toEqual({ first: "Ada", last: "Byron" });
    expect(result.current.isDirty).toBe(false);
  });

  it("keeps touched fields touched through a refetch", async () => {
    const { result, user, rerender } = renderForm(
      { first: "Ada", last: "Lovelace" },
      nameFields,
    );

    await user.click(textbox("First"));
    await user.tab();
    rerender({ first: "Augusta", last: "King" });

    expect(flagged(result.current.touched)).toEqual(["first"]);
  });

  it("ignores equal initial values passed as new objects and arrays", () => {
    const { result, rerender } = renderHook(() =>
      useForm({ initialValues: { name: "Ada", toppings: ["cheese"] } }),
    );

    const pristine = result.current.values;
    rerender();
    expect(result.current.values).toBe(pristine);

    act(() => result.current.setFieldValue("name", "Grace"));
    const edited = result.current.values;
    rerender();
    expect(result.current.values).toBe(edited);
  });

  it("ignores equal initial values with their keys in another order", () => {
    const { result, rerender } = renderForm(
      { first: "Ada", last: "Lovelace" },
      nameFields,
    );
    const values = result.current.values;

    rerender({ last: "Lovelace", first: "Ada" });

    expect(result.current.values).toBe(values);
  });
});
