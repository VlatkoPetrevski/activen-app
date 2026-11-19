import { render, screen } from "@testing-library/react";
import { buildDemoRoute } from "@activen/contracts";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../src/i18n/I18nContext.js";
import { distanceMarkers, fitViewport, meters, project, tilesFor } from "../src/lib/geo.js";
import { RouteMap } from "../src/training/RouteMap.js";

describe("geo", () => {
  it("projects like XYZ tiles and fits a route", () => {
    expect(project([0, 0], 1)).toEqual([256, 256]);
    const [x, y] = project([41.9976, 21.4337], 14);
    expect(Math.floor(x / 256)).toBe(9167); // Skopje tile column at z14
    expect(Math.floor(y / 256)).toBe(6082);
    const route = buildDemoRoute(10_000).points;
    const v = fitViewport(route, 600, 300);
    expect(v.z).toBeGreaterThanOrEqual(13);
    expect(v.z).toBeLessThanOrEqual(15);
    const tiles = tilesFor(v);
    expect(tiles.length).toBeGreaterThan(1);
    expect(tiles.every((t) => t.left > -256 && t.left < 600 && t.top > -256 && t.top < 300)).toBe(
      true,
    );
    expect(fitViewport([[41.99, 21.43]], 600, 300).z).toBe(17);
  });

  it("measures distance and places kilometre markers", () => {
    expect(Math.round(meters([41.99, 21.43], [42.0, 21.43]))).toBe(1112);
    const marks = distanceMarkers(
      [
        [41.99, 21.43],
        [42.0, 21.43],
        [42.01, 21.43],
      ],
      1000,
    );
    expect(marks.map((m) => m.km)).toEqual([1, 2]);
    expect(
      distanceMarkers(
        [
          [41.99, 21.43],
          [41.99, 21.43],
        ],
        1000,
      ),
    ).toEqual([]);
  });
});

describe("RouteMap", () => {
  it("draws the route with markers, and OSM tiles with attribution when allowed", () => {
    const route = buildDemoRoute(10_000);
    const { container, rerender } = render(
      <I18nProvider locale="mk">
        <RouteMap route={route} tiles={false} distanceInMeters={10_000} />
      </I18nProvider>,
    );
    expect(screen.getByRole("img", { name: "Рута" })).toBeInTheDocument();
    expect(container.querySelectorAll(".route-km").length).toBeGreaterThanOrEqual(4);
    expect(container.querySelector(".route-water")).not.toBeNull();
    expect(container.querySelector(".route-park")).not.toBeNull();
    // Place names are kept only where they fit: never on top of a km marker.
    const labels = [...container.querySelectorAll<SVGTextElement>(".route-label")];
    expect(labels.length).toBeGreaterThanOrEqual(1);
    const kms = [...container.querySelectorAll(".route-km circle")].map((c) => ({
      x: Number(c.getAttribute("cx")),
      y: Number(c.getAttribute("cy")),
    }));
    for (const l of labels) {
      const x = Number(l.getAttribute("x"));
      const y = Number(l.getAttribute("y"));
      expect(kms.some((k) => Math.abs(k.x - x) < 14 && Math.abs(k.y - y) < 10)).toBe(false);
    }
    expect(container.querySelector("image")).toBeNull();
    rerender(
      <I18nProvider locale="mk">
        <RouteMap route={{ points: route.points }} tiles distanceInMeters={10_000} />
      </I18nProvider>,
    );
    expect(container.querySelector("image")?.getAttribute("href")).toMatch(
      /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/,
    );
    expect(screen.getByText("© OpenStreetMap соработници")).toBeInTheDocument();
  });

  it("draws nothing without a line", () => {
    const { container } = render(
      <I18nProvider locale="mk">
        <RouteMap route={{ points: [[41.99, 21.43]] }} tiles={false} distanceInMeters={null} />
      </I18nProvider>,
    );
    expect(container.querySelector("svg")).toBeNull();
  });
});
