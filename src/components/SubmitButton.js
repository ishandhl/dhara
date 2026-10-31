'use client';
import { useFormStatus } from 'react-dom';

// Submit button that locks while the form is saving, so a second tap on a slow phone does nothing.
// `confirm` asks "are you sure?" first (for actions that post stock or cannot be undone).
export default function SubmitButton({ children, className = 'btn-primary', confirm: question, pendingText = 'Saving…', ...rest }) {
  const { pending } = useFormStatus();
  return (
    <button
      {...rest}
      className={`${className} disabled:cursor-wait disabled:opacity-60`}
      disabled={pending || rest.disabled}
      onClick={(e) => {
        if (question && !window.confirm(question)) e.preventDefault();
        rest.onClick?.(e);
      }}
    >
      {pending ? pendingText : children}
    </button>
  );
}
