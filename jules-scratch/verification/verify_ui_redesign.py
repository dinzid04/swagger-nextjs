from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Verify Home Page
    page.goto("http://localhost:3000")
    expect(page.get_by_role("heading", name="Welcome to Our Modern API")).to_be_visible()
    page.screenshot(path="jules-scratch/verification/home-page.png")

    # Verify Docs Page
    header_docs_link = page.locator('nav').get_by_role('link', name='Docs')
    header_docs_link.click()

    # Wait for the swagger UI to load
    page.wait_for_timeout(3000) # 3 seconds delay

    expect(page.locator(".swagger-ui")).to_be_visible()
    page.screenshot(path="jules-scratch/verification/docs-page.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)