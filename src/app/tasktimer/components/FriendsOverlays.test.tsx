import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FriendsOverlays from "./FriendsOverlays";

describe("FriendsOverlays Add Friend modal", () => {
  it("keeps stable friend request ids and renders mobile sheet hooks", () => {
    const html = renderToStaticMarkup(<FriendsOverlays />);

    expect(html).toContain('id="friendRequestModal"');
    expect(html).toContain('id="friendRequestEmailInput"');
    expect(html).toContain('id="friendRequestCancelBtn"');
    expect(html).toContain('id="friendRequestSendBtn"');
    expect(html).toContain('id="friendRequestModalStatus"');
    expect(html).toContain("friendRequestMobileSheet");
    expect(html).toContain("friendRequestMobileSheetHandle");
  });
});
