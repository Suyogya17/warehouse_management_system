import Button from "../components/Button";
import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <h2 className="text-4xl font-semibold tracking-tight text-slate-900">Page not found</h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">The page you requested does not exist or is no longer available.</p>
        <Link to="/" className="mt-6 inline-flex">
          <Button>Go home</Button>
        </Link>
      </div>
    </div>
  );
}
