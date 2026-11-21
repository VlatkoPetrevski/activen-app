import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/api.js";
import { I18nProvider } from "../src/i18n/I18nContext.js";
import { errorMessageKey, QueryView } from "../src/ui/States.js";

describe("errorMessageKey", () => {
  it("maps statuses to localized messages, never to server text", () => {
    expect(errorMessageKey(new ApiError(0, "Network error"))).toBe("common.offline");
    expect(errorMessageKey(new ApiError(401, "Unauthorized"))).toBe("common.forbidden");
    expect(errorMessageKey(new ApiError(403, "Forbidden"))).toBe("common.forbidden");
    expect(errorMessageKey(new ApiError(404, "Not Found"))).toBe("common.notFound");
    expect(errorMessageKey(new ApiError(500, "Boom"))).toBe("common.error");
    expect(errorMessageKey(new Error("x"))).toBe("common.error");
    expect(errorMessageKey(undefined)).toBe("common.error");
  });
});

describe("QueryView", () => {
  const wrap = (ui: React.ReactNode) => {
    return render(<I18nProvider locale="mk">{ui}</I18nProvider>);
  };

  it("shows loading, then content", () => {
    const view = (q: Parameters<typeof QueryView<string>>[0]["query"]) => (
      <QueryView query={q}>{(d) => <p>{d}</p>}</QueryView>
    );
    const { rerender } = wrap(
      view({ data: undefined, error: null, isPending: true, refetch: () => undefined }),
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    rerender(
      <I18nProvider locale="mk">
        {view({ data: "ready", error: null, isPending: false, refetch: () => undefined })}
      </I18nProvider>,
    );
    expect(screen.getByText("ready")).toBeInTheDocument();
  });

  it("explains a missing item in Macedonian and retries on request", async () => {
    const refetch = vi.fn();
    wrap(
      <QueryView
        query={{
          data: undefined,
          error: new ApiError(404, "Not Found"),
          isPending: false,
          refetch,
        }}
      >
        {() => <p>never</p>}
      </QueryView>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Ова не е пронајдено");
    expect(screen.queryByText("Not Found")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Обиди се повторно" }));
    expect(refetch).toHaveBeenCalled();
  });
});
