"use client";

import Form from "next/form";
import { useRef } from "react";
import { NativeSelect } from "@/components/forms/native-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Search + status + sort for the interviews list. A GET form (works without JS, shareable URLs);
 * with JS, selects apply on change and the search applies 400 ms after typing stops. Any change
 * drops `page`, so results start from page 1.
 */
export function DashboardFilters({ q, status, sort, statuses, sorts }: { q: string; status: string; sort: string; statuses: { value: string; label: string }[]; sorts: { value: string; label: string }[] }) {
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submit = () => form.current?.requestSubmit();
  return (
    <Form ref={form} action="/dashboard" replace scroll={false} className="grid w-full grid-cols-2 items-end gap-2 text-sm sm:flex sm:w-auto" role="search">
      <div className="col-span-2 flex flex-col gap-1 sm:w-64">
        <Label htmlFor="q">Search</Label>
        <Input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Candidate name or email"
          autoComplete="off"
          onChange={() => {
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(submit, 400);
          }}
        />
      </div>
      <div className="flex flex-col gap-1 sm:w-40">
        <Label htmlFor="status">Status</Label>
        <NativeSelect id="status" name="status" defaultValue={status} onChange={submit}>
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1 sm:w-44">
        <Label htmlFor="sort">Sort</Label>
        <NativeSelect id="sort" name="sort" defaultValue={sort} onChange={submit}>
          {sorts.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <button type="submit" className="sr-only">
        Apply filters
      </button>
    </Form>
  );
}
