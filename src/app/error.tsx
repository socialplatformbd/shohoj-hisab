"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-bold">অপ্রত্যাশিত সমস্যা হয়েছে</h1>
      <p className="text-sm text-muted">আপনার সংরক্ষিত ডেটা নিরাপদ আছে। আবার চেষ্টা করুন।</p>
      <button className="btn btn-primary" onClick={reset}>
        আবার চেষ্টা করুন
      </button>
    </div>
  );
}
