# Camera spike results

> **Retired in the current build.** `/spike.html` and `src/spike/` were removed and are no longer
> built or served. This page is retained as historical evidence: the recorded pass results below are
> the camera-spike results, not current setup or test instructions. The live app's camera code is in
> `src/features/camera/`, and the paired hunt uses world tracking. See `README.md` and
> `docs/break-the-waves.md`.

Open `/spike.html` on the preview deploy on each test iPhone. Fill in one row per check per phone. The page also keeps an event log under the buttons, which helps with the notes.

| Check | Phone model | iOS version | Result | Notes |
| --- | --- | --- | --- | --- |
| Feed plays inline, with no full-screen takeover | iPhone 17 Pro Max | 26.6.1 | Pass | |
| Rear camera is selected | iPhone 17 Pro Max | 26.6.1 | Pass | |
| How often Safari asks for camera permission again, for example on every visit | iPhone 17 Pro Max | 26.6.1 | Pass | Asks again after closing and reopening the tab. Acceptable for the trail. |
| Stream restarts after locking the phone or switching apps and returning | iPhone 17 Pro Max | 26.6.1 | Pass | Restarts seamlessly |
| Denying permission shows guidance, not a blank screen | iPhone 17 Pro Max | 26.6.1 | Pass | |
| Tapping the moving overlay works | iPhone 17 Pro Max | 26.6.1 | Pass | |
| Capturing a photo shows a preview | iPhone 17 Pro Max | 26.6.1 | Pass | Saved photo does not include the overlay. That is expected for now and only matters if a later puzzle needs it. |
| Overlay is readable outdoors in sunlight | iPhone 17 Pro Max | 26.6.1 | Pass | |
