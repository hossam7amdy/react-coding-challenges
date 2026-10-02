import {
  type ChangeEvent,
  type FocusEvent,
  type SubmitEvent,
} from "react";

export type FieldElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export interface UseFormOptions<T> {
  initialValues: T;
}

/** Checkboxes and radios need more than a name to be wired up. */
export type RegisterOptions = { type: "checkbox" } | { type: "radio"; value: string };

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

export function useForm<T extends Record<string, unknown>>(
  _options: UseFormOptions<T>,
): UseFormReturn<T> {
  throw new Error("Not implemented!")
}
