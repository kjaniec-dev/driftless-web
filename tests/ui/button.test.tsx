import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/Button";

describe("Button", () => {
  it("quiet buttons get a visible, field-like border instead of the kit's faint outline/ghost", () => {
    render(<Button variant="quiet">Cancel</Button>);
    const cls = screen.getByRole("button", { name: "Cancel" }).className;
    expect(cls).toContain("border-control-border");
    expect(cls).toContain("hover:border-control-border-hover");
    expect(cls).not.toMatch(/(^|\s)border-border(\s|$)/); // the faint default was replaced
  });

  it("destructive buttons are drawn in the danger colour", () => {
    render(<Button variant="destructive">Delete</Button>);
    const cls = screen.getByRole("button", { name: "Delete" }).className;
    expect(cls).toContain("text-danger");
    expect(cls).toContain("border-danger/50");
  });

  it("passes the kit variants through unchanged", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" }).className).toContain("bg-primary");
  });
});
