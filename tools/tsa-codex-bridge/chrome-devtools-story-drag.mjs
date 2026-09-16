import { pathToFileURL } from "node:url";
import { join } from "node:path";

// Keep all input on the official MCP's existing authenticated page. No extra
// browser connection, CDP endpoint, file access, or account API is introduced.
export function installStoryDrag(tool, zod) {
  const original = tool.handler;
  tool.schema = { ...tool.schema,
    to_uid: tool.schema.to_uid.optional(),
    deltaX: zod.number().finite().min(-2000).max(2000).optional(),
    deltaY: zod.number().finite().min(-2000).max(2000).optional(),
  };
  tool.description += " In Meta Story photo editor, drag a current overlay/resize uid by deltaX and deltaY (viewport CSS pixels), or onto to_uid. Observe current bounds first and verify afterward.";
  tool.handler = async (request, response) => {
    const p = request.params;
    const source = await request.page.getElementByUid(p.from_uid);
    try {
      const page = source.frame.page();
      const url = new URL(page.url());
      const isStory = url.hostname === "business.facebook.com" && url.pathname.includes("/story_composer");
      if (!isStory) {
        if (p.deltaX !== undefined || p.deltaY !== undefined || !p.to_uid) throw new Error("Coordinate drag is limited to the Meta Story editor");
        return await original(request, response);
      }
      const inEditor = await source.evaluate(el => !!el.closest('[role="dialog"]'));
      if (!inEditor) throw new Error("Drag source must be in the visible Story editor dialog");
      // Resolve coordinates BEFORE hover/mousedown: Meta replaces its overlay
      // element on selection, invalidating the original ElementHandle.
      const start = await source.clickablePoint();
      let end;
      if (p.deltaX !== undefined || p.deltaY !== undefined) {
        if (!Number.isFinite(p.deltaX) || !Number.isFinite(p.deltaY)) throw new Error("Both drag deltas are required");
        end = { x: start.x + p.deltaX, y: start.y + p.deltaY };
      } else {
        if (!p.to_uid) throw new Error("Drag destination is required");
        const target = await request.page.getElementByUid(p.to_uid);
        try { end = await target.clickablePoint(); } finally { await target.dispose(); }
      }
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      if (end.x < 0 || end.y < 0 || end.x >= viewport.width || end.y >= viewport.height) throw new Error("Drag destination is outside the viewport");
      const result = await request.page.waitForEventsAfterAction(async () => {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        try {
          for (let i = 1; i <= 12; i++) {
            await page.mouse.move(start.x + (end.x - start.x) * i / 12, start.y + (end.y - start.y) * i / 12);
            await new Promise(resolve => setTimeout(resolve, 30));
          }
          await new Promise(resolve => setTimeout(resolve, 80));
        } finally { await page.mouse.up(); }
      });
      response.appendResponseLine("Story mouse drag completed. Verify current overlay bounds and screenshot before continuing.");
      response.attachWaitForResult(result);
      if (p.includeSnapshot) response.includeSnapshot();
    } finally { await source.dispose(); }
  };
}

// Loaded with Node --import only for the Bridge-owned official MCP daemon.
if (process.env.TSA_STORY_DRAG_PACKAGE_ROOT) {
  const root = process.env.TSA_STORY_DRAG_PACKAGE_ROOT;
  const { drag } = await import(pathToFileURL(join(root, "build/src/tools/input.js")).href);
  const { zod } = await import(pathToFileURL(join(root, "build/src/third_party/index.js")).href);
  installStoryDrag(drag, zod);
}
