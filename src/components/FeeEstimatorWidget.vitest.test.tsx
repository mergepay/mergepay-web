import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeeEstimatorWidget } from "./FeeEstimatorWidget";

describe("FeeEstimatorWidget (#647)", () => {
  it("renders projected Stellar network fee and operation breakdown", () => {
    render(<FeeEstimatorWidget operationCount={3} currency="USD" amount="45" assetCode="XLM" />);
    expect(screen.getByText(/Est\. network fee/i)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/Fee for sending/i)).toBeInTheDocument();
  });

  it("displays a non-blocking fallback alert when live fee estimation fails", () => {
    render(
      <FeeEstimatorWidget
        operationCount={1}
        feeError="Soroban RPC timeout"
      />
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/Soroban RPC timeout/i);
    expect(alert).toHaveTextContent(/showing the base estimate/i);
  });
});
