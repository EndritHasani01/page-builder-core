import { render, screen } from "@testing-library/react";

import { App } from "./App";

test("renders the page builder shell", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "Page Builder" })).toBeInTheDocument();
});

