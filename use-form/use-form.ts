import {
  useRef,
  useMemo,
  useState,
  useReducer,
  useLayoutEffect,
  useCallback,
  type FocusEvent,
  type ChangeEvent,
  type SubmitEvent,
} from "react";

export type FieldElement =
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLTextAreaElement;

export interface UseFormOptions<T> {
  initialValues: T;
}

/** Checkboxes and radios need more than a name to be wired up. */
export type RegisterOptions =
  | { type: "checkbox" }
  | { type: "radio"; value: string };

export interface FieldProps {
  name: string;
  value?: string | number | readonly string[];
  checked?: boolean;
  onChange: (event: ChangeEvent<FieldElement>) => void;
  onBlur: (event: FocusEvent<FieldElement>) => void;
}

interface FormState<T> {
  values: T;
  isSubmitting: boolean;
  submitCount: number;
  touched: { [key in keyof T]: boolean };
}

export interface UseFormReturn<T> extends FormState<T> {
  isDirty: boolean;
  dirty: { [key in keyof T]: boolean };
  handleChange: (event: ChangeEvent<FieldElement>) => void;
  handleBlur: (event: FocusEvent<FieldElement>) => void;
  register: (name: keyof T & string, options?: RegisterOptions) => FieldProps;
  setFieldValue: <K extends keyof T>(name: K, value: T[K]) => void;
  setValues: (values: T) => void;
  reset: () => void;
  handleSubmit: (
    onSubmit: (values: T) => void | Promise<void>,
  ) => (event?: SubmitEvent<HTMLFormElement>) => Promise<void>;
}

type Action<T> =
  | { type: "set-field"; name: keyof T; value: T[keyof T] }
  | { type: "merge"; payload: Partial<T> }
  | { type: "reset"; payload: T }
  | { type: "reinitialize"; values: T; dirty: { [key in keyof T]: boolean } }
  | { type: "submit-start" }
  | { type: "submit-end" }
  | { type: "touched"; field: keyof T };

function createInitState<T extends Record<string, unknown>>(
  initialValues: T,
): FormState<T> {
  const touched = {} as FormState<T>["touched"];
  for (const field of Object.keys(initialValues)) {
    touched[field as keyof T] = false;
  }
  return {
    submitCount: 0,
    isSubmitting: false,
    values: { ...initialValues },
    touched,
  };
}

function isEqualArray(a: Array<unknown>, b: Array<unknown>): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let equal = true;
  for (let i = 0; i < a.length && equal; i++) {
    equal = isEqual(a[i], b[i]);
  }
  return equal;
}
function isEqualObject(a: object, b: object): boolean {
  const aKeys = Object.keys(a).sort() as (keyof typeof a)[];
  const bKeys = Object.keys(b).sort() as (keyof typeof b)[];

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  let equal = true;
  for (let i = 0; i < aKeys.length && equal; i++) {
    if (aKeys[i] !== bKeys[i]) {
      return false;
    }
    equal = isEqual(a[aKeys[i]], b[bKeys[i]]);
  }
  return equal;
}
function isEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Date && b instanceof Date) {
    return isEqual(a.getTime(), b.getTime());
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return isEqualArray(a, b);
  }
  if (
    typeof a === "object" &&
    a !== null &&
    typeof b === "object" &&
    b !== null
  ) {
    return isEqualObject(a, b);
  }
  return false;
}

function reducer<T extends Record<string, unknown>>(
  state: FormState<T>,
  action: Action<T>,
): FormState<T> {
  switch (action.type) {
    case "set-field":
      return {
        ...state,
        values: { ...state.values, [action.name]: action.value },
      };
    case "merge":
      return {
        ...state,
        values: { ...state.values, ...action.payload },
      };
    case "reset":
      return createInitState(action.payload);
    case "submit-start":
      return {
        ...state,
        isSubmitting: true,
        submitCount: state.submitCount + 1,
      };
    case "submit-end":
      return {
        ...state,
        isSubmitting: false,
      };
    case "touched":
      return {
        ...state,
        touched: { ...state.touched, [action.field]: true },
      };
    case "reinitialize": {
      const { values, dirty } = action;
      const newValues = {} as T;
      for (const key of Object.keys(values)) {
        const field = key as keyof T;
        if (!dirty[field]) {
          newValues[field] = values[field];
        }
      }
      return {
        ...state,
        values: { ...state.values, ...newValues },
      };
    }
    default:
      throw new Error("Invalid action type", { cause: action });
  }
}

export function useForm<T extends Record<string, unknown>>(
  options: UseFormOptions<T>,
): UseFormReturn<T> {
  const [state, dispatch] = useReducer(
    reducer<T>,
    options.initialValues,
    createInitState<T>,
  );
  const ref = useRef(state);
  const [config, setConfig] = useState(() => ({
    initialValues: options.initialValues,
    formKeys: Object.keys(options.initialValues) as (keyof T)[],
  }));

  useLayoutEffect(() => {
    ref.current = state;
  }, [state]);

  const handleDispatch = useCallback((action: Action<T>) => {
    ref.current = reducer(ref.current, action);
    dispatch(action);
  }, []);

  const handleChange = useCallback<UseFormReturn<T>["handleChange"]>(
    (e) => {
      if (!e.target.name) return;
      const type = e.target.type;
      const name = e.target.name;
      let value: boolean | FieldProps["value"] = e.target.value;
      if (type === "number" && value !== "") {
        value = Number(value);
      } else if (type === "select-multiple") {
        value = [...(e.target as HTMLSelectElement).selectedOptions].map(
          (opt) => opt.value,
        );
      } else if (type === "checkbox") {
        value = (e.target as HTMLInputElement).checked;
      }
      // The DOM is untyped: trust the input's name and its parsed value.
      handleDispatch({
        type: "set-field",
        name: name as keyof T,
        value: value as T[keyof T],
      });
    },
    [handleDispatch],
  );

  const handleBlur = useCallback<UseFormReturn<T>["handleBlur"]>(
    (e) => {
      const name = e.target.name as keyof T;
      if (!name || ref.current.touched[name]) return;
      handleDispatch({ type: "touched", field: name });
    },
    [handleDispatch],
  );

  const handleReset = useCallback<UseFormReturn<T>["reset"]>(() => {
    handleDispatch({ type: "reset", payload: config.initialValues });
  }, [config, handleDispatch]);

  const handleSubmit = useCallback<UseFormReturn<T>["handleSubmit"]>(
    (onSubmit) => {
      return async (e) => {
        e?.preventDefault();
        if (ref.current.isSubmitting) return;
        handleDispatch({ type: "submit-start" });
        try {
          await onSubmit(ref.current.values);
        } finally {
          handleDispatch({ type: "submit-end" });
        }
      };
    },
    [handleDispatch],
  );

  const handleSetValues = useCallback<UseFormReturn<T>["setValues"]>(
    (values) => {
      handleDispatch({ type: "merge", payload: values });
    },
    [handleDispatch],
  );

  const handleSetFieldValue = useCallback<UseFormReturn<T>["setFieldValue"]>(
    (name, value) => {
      handleDispatch({ type: "set-field", name, value });
    },
    [handleDispatch],
  );

  const register = useCallback<UseFormReturn<T>["register"]>(
    (name, options) => {
      if (!config.formKeys.includes(name)) {
        throw new Error(`Unknown form name: ${name}`);
      }

      let value: FieldProps["value"];
      let checked: boolean | undefined = undefined;

      switch (options?.type) {
        case "radio": {
          value = options.value;
          checked = state.values[name] === options.value;
          break;
        }
        case "checkbox": {
          checked = !!state.values[name];
          break;
        }
        default: {
          value = state.values[name] as FieldProps["value"];
        }
      }

      return {
        name,
        value,
        checked,
        onChange: handleChange,
        onBlur: handleBlur,
      };
    },
    [config, state, handleChange, handleBlur],
  );

  const dirty = useMemo(() => {
    const initialValues = config.initialValues;
    const dirty = {} as { [key in keyof T]: boolean };
    for (const [field, value] of Object.entries(state.values)) {
      const isNotEqual = !isEqual(value, initialValues[field]);
      dirty[field as keyof T] = isNotEqual;
    }
    return dirty;
  }, [state.values, config.initialValues]);

  const isDirty = useMemo(() => Object.values(dirty).some(Boolean), [dirty]);

  const isInitValuesChanged = !isEqual(
    config.initialValues,
    options.initialValues,
  );

  if (isInitValuesChanged) {
    const initialValues = options.initialValues;
    dispatch({ type: "reinitialize", values: initialValues, dirty });
    setConfig((prev) => ({ ...prev, initialValues }));
  }

  return {
    ...state,
    dirty,
    isDirty,
    register,
    handleBlur,
    handleSubmit,
    handleChange,
    reset: handleReset,
    setFieldValue: handleSetFieldValue,
    setValues: handleSetValues,
  };
}
