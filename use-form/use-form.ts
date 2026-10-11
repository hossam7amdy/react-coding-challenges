import {
  useRef,
  useState,
  useReducer,
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

export interface UseFormReturn<T> {
  values: T;
  handleChange: (event: ChangeEvent<FieldElement>) => void;
  handleBlur: (event: FocusEvent<FieldElement>) => void;
  register: (name: keyof T & string, options?: RegisterOptions) => FieldProps;
  setFieldValue: <K extends keyof T>(name: K, value: T[K]) => void;
  setValues: (values: T) => void;
  reset: () => void;
  handleSubmit: (
    onSubmit: (values: T) => void | Promise<void>,
  ) => (event?: SubmitEvent<HTMLFormElement>) => Promise<void>;
  isSubmitting: boolean;
  submitCount: number;
}

interface FormState<T> {
  values: T;
  isSubmitting: boolean;
  submitCount: number;
}

type Action<T> =
  | { type: "set-field"; name: keyof T; value: T[keyof T] }
  | { type: "merge"; payload: Partial<T> }
  | { type: "reset"; payload: T }
  | { type: "submit-start" }
  | { type: "submit-end" };

function reducer<T>(state: FormState<T>, action: Action<T>): FormState<T> {
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
      return {
        ...state,
        submitCount: 0,
        isSubmitting: false,
        values: action.payload,
      };
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
    default:
      throw new Error("Invalid action type", { cause: action });
  }
}

export function useForm<T extends Record<string, unknown>>(
  options: UseFormOptions<T>,
): UseFormReturn<T> {
  const initState = {
    submitCount: 0,
    isSubmitting: false,
    values: options.initialValues,
  };
  const ref = useRef(initState);
  const [state, dispatch] = useReducer(reducer, initState);
  const [config] = useState(() => ({
    initialValues: options.initialValues,
    formKeys: Object.keys(options.initialValues) as (keyof T)[],
  }));

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

  const handleBlur = useCallback<UseFormReturn<T>["handleBlur"]>((e) => {
    const { name } = e.target;
    if (!name || name != null) return;
  }, []);

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

  return {
    ...state,
    register,
    handleBlur,
    handleSubmit,
    handleChange,
    reset: handleReset,
    setFieldValue: handleSetFieldValue,
    setValues: handleSetValues,
  };
}
