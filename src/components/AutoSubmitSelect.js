'use client';

/** A <select> that submits its form as soon as the choice changes. */
export default function AutoSubmitSelect(props) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
