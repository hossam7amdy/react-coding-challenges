# useForm

Build a form library one kata at a time. It starts as a single `useForm` hook
that wires up two text inputs, and grows into validation, async checks, nested
paths, field arrays, per-field subscriptions and type-safe paths.

## Level 1: Core state

- **Text fields.** `useForm({ initialValues })` returns `values` and one
      shared `handleChange`.
      _Done when_ two inputs update independently.
- **All input types.** Checkbox, radio group, select, multi-select, number.
      _Done when_ each one round-trips correctly and an empty number input
      doesn't silently become `0`.
- **Field props helper.** `register(name)` returns
      `{ name, value, onChange, onBlur }`.
      _Done when_ no input is wired by hand and a missing name fails loudly.
- **Programmatic control.** `setFieldValue`, `setValues`, `reset`.
      _Done when_ `reset` restores the values and all metadata.
- **Submission.** `handleSubmit(onSubmit)` with async support,
      `isSubmitting` and `submitCount`.
      _Done when_ double-clicking submit sends one request.

## Level 2: Metadata

- **Touched.** Track blur per field.
      _Done when_ a field becomes touched on its first blur and `reset` clears it.
- **Dirty.** Per field and for the whole form, compared to the initial values.
      _Done when_ typing and then reverting marks the field clean again, arrays
      included.
- **Late initial values.** The data arrives from an API after mount.
      _Done when_ an edit form loads correctly and a refetch doesn't wipe unsaved
      edits.

## Level 3: Validation

- **Field validators.** Per-field sync functions that produce an `errors`
      object.
- **Validation modes.** `onSubmit`, `onBlur`, `onChange`, and "blur first,
      then on every change once the field is invalid".
      _Done when_ no error appears after the first keystroke of an email.
- **Form-level and schema validation.** Accept `validate(values)` or a
      Zod/Yup adapter.
      _Done when_ the same form works with either.
- **Cross-field rules.** Confirm password; end date after start date.
      _Done when_ editing the password revalidates the confirmation.
- **Invalid submit.** Block the submit, mark every field touched and focus the
      first invalid one.
      _Done when_ a keyboard user lands on the error.
- **Server errors.** Map an API error response onto fields, plus a form-level
      message.
      _Done when_ a server error clears once that field changes.

## Level 4: Async

- **Async field validation.** A debounced "is this username taken?" check
      with a per-field `isValidating`.
      _Done when_ a slow old response can never overwrite a newer one.
- **Pending and unmount edges.** Submit while validation is pending; unmount
      mid-request.
      _Done when_ the behavior is predictable and there are no
      setState-on-unmounted warnings.

## Level 5: Structure

- **Nested values.** Paths like `address.city` for values, errors and
      touched, all updated immutably.
- **Field arrays.** Add, remove, insert and move rows.
      _Done when_ removing row 2 keeps row 3's value, error and touched state on
      row 3.
- **Conditional fields.** "Company name" only for business accounts.
      _Done when_ you've decided whether hidden fields are validated and
      submitted, and tested that decision.
- **Parse and format.** Display `1,000.50` but store `1000.5`; group card
      digits in fours.
      _Done when_ the caret doesn't jump while you edit in the middle of a value.
      (Harder than it sounds.)
- **Multi-step wizard.** Per-step validation, state kept across steps, back
      navigation.

## Level 6: Performance

- **Baseline.** Build a 100-field form and count re-renders per keystroke
      with `<Profiler>`.
- **Field subscriptions.** Move the state into an external store that fields
      subscribe to.
      _Done when_ typing re-renders one field, not a hundred.
- **Watch.** `watch("country")` drives dependent UI without re-rendering the
      whole form.
- **Uncontrolled mode.** Ref-based registration that reads the DOM at submit.
      _Done when_ you can explain when you'd pick it over controlled.

## Level 7: Integration

- **Non-native inputs.** A `Controller` adapter for components whose
      `onChange` passes a value instead of an event (date pickers, React Select).
- **Accessibility.** `aria-invalid`, errors linked with `aria-describedby`,
      an error summary on submit.
      _Done when_ a screen reader announces the error.
- **Draft persistence.** Save and restore drafts, with a per-field opt-out.
      _Done when_ the card number and CVV are never persisted.
- **Type safety.** Infer valid paths from `initialValues`.
      _Done when_ `register("address.city")` is a compile error.
