import { TextField, type TextFieldProps } from "@kjaniec-dev/ui";

type Props = Omit<TextFieldProps, "error" | "hint"> & {
  error?: string | undefined;
  hint?: string | undefined;
};

/**
 * `TextField` that accepts `undefined` for `error`/`hint`. The kit declares them as plain
 * optional props, which `exactOptionalPropertyTypes` would otherwise reject at every call site.
 */
export function Field({ error, hint, ...rest }: Props) {
  return <TextField {...rest} {...(error ? { error } : {})} {...(hint ? { hint } : {})} />;
}
