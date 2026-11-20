import os
import asyncio, json, re, time
from playwright.async_api import async_playwright, expect
BASE="http://localhost:5173"
problems=[]
def link_for(email):
    for _ in range(40):
        for line in reversed(open(os.environ.get("API_LOG", "api.log")).read().splitlines()):
            if '"Mailer"' in line or "email (log transport)" in line:
                d=json.loads(line)
                if d.get("to")==email and "text" in d:
                    m=re.search(r"https?://\S+", d["text"])
                    if m: return m.group(0)
        time.sleep(0.25)
    raise RuntimeError("no link for "+email)
async def sign_in(b, email, name=None, coach=False):
    ctx = await b.new_context(viewport={"width":1280,"height":900}, locale="mk-MK", accept_downloads=True)
    pg = await ctx.new_page()
    pg.on("pageerror", lambda e: problems.append((email,"pageerror",str(e))))
    pg.on("console", lambda m: m.type=="error" and problems.append((email,"console",m.text)))
    pg.on("response", lambda r: r.status>=500 and problems.append((email,"http",r.status,r.url)))
    await pg.goto(BASE+"/sign-in")
    await pg.get_by_label("Е-пошта").fill(email)
    open(os.environ.get("API_LOG", "api.log"),"a").close()
    await pg.get_by_role("button", name="Прати ми линк за најава").click()
    await pg.wait_for_timeout(800)
    await pg.goto(link_for(email).replace("http://localhost:5173", BASE))
    await pg.wait_for_timeout(1500)
    if await pg.get_by_role("heading", name="Добредојде во ActiveN").count():
        if name: await pg.get_by_label("Како да те викаме?").fill(name)
        if coach: await pg.get_by_role("checkbox", name="Тренирам и спортисти (тренер)").check()
        await pg.get_by_role("button", name="Почни").click(); await pg.wait_for_timeout(1500)
    return ctx, pg
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        actx, a = await sign_in(b, "athlete.e2e@example.com", "Влатко Е2Е")
        cctx, c = await sign_in(b, "coach.e2e@example.com", "Ана Тренер", coach=True)
        step=lambda s: print("✓", s)
        # Coach invites the athlete.
        await c.goto(BASE+"/coach"); await c.wait_for_timeout(1500)
        await c.get_by_role("button", name=re.compile("Покани спортист")).click()
        dlg=c.get_by_role("dialog", name="Покани спортист")
        await dlg.get_by_label("Е-пошта").fill("athlete.e2e@example.com")
        await dlg.get_by_role("button", name="Покани спортист").click()
        await expect(dlg.get_by_text("Поканата е пратена.")).to_be_visible(); step("coach invites")
        # Athlete accepts (default scopes: activities + comments).
        await a.goto(BASE+"/my-coach"); await a.wait_for_timeout(1200)
        await a.get_by_role("button", name="Прифати").click(); await a.wait_for_timeout(1200)
        await expect(a.get_by_text(re.compile("^Споделуваш:"))).to_be_visible(); step("athlete accepts")
        # Coach analytics with real data.
        await c.goto(BASE+"/coach/analytics"); await c.wait_for_timeout(1500)
        await expect(c.get_by_text("Активни спортисти")).to_be_visible()
        await c.locator(".roster .segment-head").first.click()
        await c.locator(".segment .btn-primary").first.click(); await c.wait_for_timeout(1500)
        await expect(c.get_by_text("Исполнет план (28 д.)")).to_be_visible()
        n = await c.locator(".an-activity").count(); assert n>0, "no activities"; step(f"coach analytics ({n} activities)")
        await c.locator(".an-activity").first.click(); await c.wait_for_timeout(1500)
        await expect(c.get_by_text("Извор и сензори")).to_be_visible()
        locked = await c.get_by_text("Спортистот не ја споделува GPS мапата.").count()
        step(f"coach activity page (GPS locked shown: {bool(locked)})")
        # Coach writes a structured workout; the suggestion appears by itself.
        await c.goto(BASE+"/coach/planner"); await c.wait_for_timeout(1500)
        await c.get_by_role("button", name="Додај тренинг").click()
        dlg=c.get_by_role("dialog", name="Додај тренинг")
        await dlg.get_by_label("Опис").fill("Загревање 2 km, 5 × 1000 m на 4:00/km, одмор 2 мин, смирување 2 km")
        await expect(dlg.get_by_role("region", name="Предлог")).to_be_visible(timeout=5000)
        await dlg.get_by_role("button", name="Прифати чекори").click()
        await dlg.get_by_role("button", name="Зачувај").click(); await c.wait_for_timeout(1500)
        await expect(c.get_by_text(re.compile("5 × 1 km @ 4:00 /km"))).to_be_visible(); step("coach saves structured workout")
        # Athlete sees it on the plan.
        await a.goto(BASE+"/plan"); await a.wait_for_timeout(1500)
        await expect(a.get_by_text(re.compile("5 × 1 km @ 4:00 /km")).first).to_be_visible(); step("athlete sees steps")
        # Athlete shares an activity: the canvas really draws, and downloads a PNG.
        await a.goto(BASE+"/activities"); await a.wait_for_timeout(1500)
        await a.locator(".activity-head").first.click(); await a.wait_for_timeout(500)
        await a.get_by_role("link", name="Детали").first.click(); await a.wait_for_timeout(1500)
        await a.get_by_role("link", name="Сподели").click(); await a.wait_for_timeout(2000)
        size = await a.evaluate("document.querySelector('.share-frame canvas').toDataURL('image/png').length")
        assert size > 50_000, f"canvas too small: {size}"
        async with a.expect_download() as d:
            await a.get_by_role("button", name=re.compile("Преземи слика")).click()
        dl = await d.value; step(f"share download {dl.suggested_filename} (canvas {size//1024} KB)")
        # Setting persists across reloads.
        await a.goto(BASE+"/profile"); await a.wait_for_timeout(1200)
        await a.get_by_role("button", name=re.compile("^Планирање")).click()
        await a.get_by_role("checkbox", name=re.compile("Автоматски предлог")).uncheck(); await a.wait_for_timeout(1000)
        await a.reload(); await a.wait_for_timeout(2000)
        await expect(a.get_by_text("Автоматски предлог: исклучен")).to_be_visible(); step("setting persisted")
        print("PROBLEMS", problems)
        await b.close()
asyncio.run(main())
