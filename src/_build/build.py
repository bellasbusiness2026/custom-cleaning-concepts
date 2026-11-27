# Builds the site from template.html. Two variants:
#   python3 build.py          -> /workspace/clean/site-staging/index.html  (TEST build: direct "Pay deposit now" buttons on, test checkout links)
#   python3 build.py --live   -> /workspace/clean/site-live/index.html     (PUBLIC build: direct-pay switched OFF, no payment links, no HTML comments)
# The direct-pay links stay in services.py (the `pay=` fields). When live payment links exist, put them in services.py and
# build with PAY_NOW = True below (or drop the --live flag's pay switch).
import re, sys, os
import services
LIVE = "--live" in sys.argv
PAY_NOW = True                # Lucy said "Go live" Nov 17 2026, 9:03 PM; live links are in services.py
out_dir = "/workspace/clean/site-live" if LIVE else "/workspace/clean/site-staging"
os.makedirs(out_dir, exist_ok=True)
t = open('template.html').read()
t = re.sub(r"@@IFPAY@@(.*?)@@ELSE@@(.*?)@@ENDIF@@", lambda m: m.group(1) if PAY_NOW else m.group(2), t, flags=re.S)
t = t.replace('@@SERVICES@@', services.render(pay_enabled=PAY_NOW))
t = t.replace('@@REVIEWS@@', open('reviews_section.html').read().rstrip('\n'))
t = t.replace('@@APP@@', open('app.js').read().replace('@@REVIEWSCRIPT@@', open('review_script.js').read().rstrip('\n')))
if LIVE:
    t = re.sub(r"<!--.*?-->", "", t, flags=re.S)
    t = re.sub(r"\n[ \t]*\n[ \t]*\n+", "\n\n", t)
    chk = re.sub(r"https://buy\.stripe\.com/[A-Za-z0-9]+", "", t)
    chk = chk.replace('"https://buy.stripe.com/"', '')
    bad = [w for w in ("buy.stripe.com/test_", "test_", "stripe", "@@", "free quote", "goes here") if re.search(re.escape(w), chk, re.I)]
    bad += [w for w in ("PLACEHOLDER", "DRAFT", "TODO") if w in chk]   # case-sensitive: the HTML placeholder="" attribute is fine
    assert not bad, "live build contains: %s" % bad
open(os.path.join(out_dir, 'index.html'), 'w').write(t)
print(("live" if LIVE else "staging"), len(t))
