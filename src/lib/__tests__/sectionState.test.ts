import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ApiRequestError } from "../api";
import {
  UNAVAILABLE_VALUE,
  UNAVAILABLE_VALUE_LABEL,
  describeSectionError,
  financialValue,
  resolveSectionStatus,
} from "../sectionState";

describe("resolveSectionStatus", () => {
  it("reports loading on a first load", () => {
    assert.equal(
      resolveSectionStatus({ isLoading: true, isError: false, hasData: false }),
      "loading"
    );
  });

  it("reports error when the request failed with nothing cached", () => {
    assert.equal(
      resolveSectionStatus({ isLoading: false, isError: true, hasData: false }),
      "error"
    );
  });

  it("reports empty when the response carried no rows", () => {
    assert.equal(
      resolveSectionStatus({
        isLoading: false,
        isError: false,
        hasData: true,
        isEmpty: true,
      }),
      "empty"
    );
  });

  it("reports ready when data is present", () => {
    assert.equal(
      resolveSectionStatus({
        isLoading: false,
        isError: false,
        hasData: true,
        isEmpty: false,
      }),
      "ready"
    );
  });

  it("keeps showing cached data when a background refetch fails", () => {
    assert.equal(
      resolveSectionStatus({
        isLoading: false,
        isError: true,
        hasData: true,
        isEmpty: false,
      }),
      "ready"
    );
  });

  it("resolves each section independently", () => {
    // One failed request must not change what a sibling renders.
    const failed = { isLoading: false, isError: true, hasData: false };
    const loaded = {
      isLoading: false,
      isError: false,
      hasData: true,
      isEmpty: false,
    };
    assert.equal(resolveSectionStatus(failed), "error");
    assert.equal(resolveSectionStatus(loaded), "ready");
  });
});

describe("describeSectionError", () => {
  it("asks the user to reconnect on an auth failure", () => {
    const copy = describeSectionError(
      new ApiRequestError(401, "unauthorized", "Token expired"),
      "your balances"
    );
    assert.equal(copy.title, "Session expired");
    assert.equal(copy.retryable, false);
    assert.match(copy.description, /your balances/);
  });

  it("offers a retry for server and transport failures", () => {
    assert.equal(
      describeSectionError(new ApiRequestError(500, "internal", "boom")).retryable,
      true
    );
    assert.equal(describeSectionError(new Error("network")).retryable, true);
  });

  it("does not offer a retry for a missing resource", () => {
    const copy = describeSectionError(
      new ApiRequestError(404, "not_found", "No such group"),
      "this group"
    );
    assert.equal(copy.retryable, false);
    assert.match(copy.description, /this group/);
  });

  it("never renders the raw server message", () => {
    const copy = describeSectionError(
      new ApiRequestError(
        500,
        "internal",
        "psql: FATAL at /srv/api/db.ts — token=abc123"
      ),
      "your groups"
    );
    assert.equal(copy.description.includes("psql"), false);
    assert.equal(copy.description.includes("token=abc123"), false);
    assert.equal(copy.description.includes("/srv/api"), false);
  });

  it("has usable copy when the subject is not specified", () => {
    const copy = describeSectionError(new Error("nope"));
    assert.equal(copy.title.length > 0, true);
    assert.equal(copy.description.length > 0, true);
  });
});

describe("financialValue", () => {
  it("shows the formatted figure when the request succeeded", () => {
    const value = financialValue("1,240.50", true);
    assert.equal(value.text, "1,240.50");
    assert.equal(value.available, true);
  });

  it("never renders an unavailable figure as a number", () => {
    const value = financialValue("0", false);
    assert.equal(value.text, UNAVAILABLE_VALUE);
    assert.equal(value.text.includes("0"), false);
    assert.equal(value.available, false);
    assert.equal(value.label, UNAVAILABLE_VALUE_LABEL);
  });

  it("labels the placeholder for assistive technology", () => {
    assert.equal(financialValue("42", false).label, "Unavailable");
  });
});
