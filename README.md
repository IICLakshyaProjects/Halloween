Halloween Drawing Contest Portal — Requirements
Development requirements. Stack: Next.js, TypeScript, and Neon PostgreSQL.
1. Objective
Build a responsive browser-based portal where employees identify themselves, start a timed Halloween drawing attempt, create an original drawing using the built-in Paint-style tools, and submit it for review. Administrators manage the contest, enable repeat attempts for testing, review submissions, and select a winner. No application installation is required.
2. Roles
Role	Permissions
Employee	Enter name and employee ID, read rules, start or resume their attempt, draw, submit, and view their own submission confirmation.
Administrator	Sign in through protected admin authentication, manage contest settings, toggle repeat-attempt testing, review entries, and select a winner.


Employee identification must never grant administrator permissions. Employees must not be able to browse other employees' drawings or personal details.
3. Employee login and identification
3.1 Initial screen
- Opening the portal displays the employee login screen with contest title, employee name, employee ID, and a Continue button.
- Both fields are mandatory. Trim leading and trailing whitespace from names; reject blank names and limit names to 100 characters. Support spaces, Unicode letters, and common name punctuation.
- Display LA-IND- as a fixed, non-editable prefix beside the ID input.
- Employees enter only the four-digit suffix. The displayed complete format is LA-IND-XXXX; example: LA-IND-0042.
- Treat exactly four digits as the initial requirement.
3.2 Employee ID validation
- Accept only ASCII digits 0–9 in the suffix, including pasted input.
- Reject letters, signs, decimals, spaces, special characters, and suffixes shorter or longer than four digits.
- Use a text input with numeric keyboard hints, not a numeric value type, to preserve leading zeros.
- Validate on both client and server. Full ID validation pattern: ^LA-IND-[0-9]{4}$.
- Store the full employee ID as a string and use it as the participant key. Changing a name must not create a new participant or bypass attempt restrictions.
- Show specific validation messages, such as “Enter exactly 4 digits.”
3.3 Session and identity limitations
- On successful validation, create a server-managed employee session and display the rules/attempt status screen.
- Name and employee ID are self-declared identification, not verified authentication. A person who knows another ID could impersonate that employee; the system cannot claim one verified human per account under this login model.
- Do not expose existing private drawing data solely because someone enters its employee ID. Resume private work through the original valid session. A new browser/device session for an already-used ID must show an attempt-status message without returning the drawing; any recovery requires an administrator-assisted process.
- Do not silently overwrite an existing employee's stored name on a conflicting login. Show a neutral conflict message and direct the employee to the organizer.
- SSO, OTP, and employee-directory verification are outside the initial scope unless separately requested.
4. Employee workflow
1. Open portal and enter employee name and numeric ID suffix.
2. View contest instructions, permitted tools, 15-minute duration, submission rules, and current attempt status.
3. Acknowledge the rules and click Start Drawing. The timer starts only after the server successfully creates the attempt.
4. Draw on the canvas while the countdown and save status remain visible.
5. Submit early or continue until time expires.
6. View a locked submission confirmation containing entry reference, submission status, and completion time.
   Logging in, reading instructions, or refreshing the page must not start or restart the timer. Starting requires connectivity and a successful server response.
5. Drawing workspace — MS Paint-style experience
5.1 Layout and visual design
- Use the attached MS Paint screenshot as the visual reference for toolbar grouping, visible color swatches, brush selectors, side sliders, and the dominant white drawing canvas.
- Desktop/tablet: a compact top ribbon grouped into Selection, Image, Tools, Brushes, Shapes, Colors, and Layers. Place vertical size and opacity sliders beside the canvas, matching the reference arrangement.
- Phone: adapt the same tools into a compact, collapsible ribbon/tool drawer. Keep primary tools and color swatches directly visible; show secondary settings in touch-friendly popovers without permanently shrinking the canvas.
- Give the drawing canvas the maximum available workspace. Support portrait, landscape, and a focus mode that collapses secondary controls. Keep remaining time, save status, toolbar access, and Submit accessible without covering drawable content.
- Use a subtle Halloween theme around the workspace, with a plain white default canvas. Avoid decorative panels, long instructions, oversized headings, or animations that distract from drawing.
- Show recognizable tool icons, concise labels/tooltips, and clear active-tool, brush, size, opacity, and color indicators. Touch targets must be at least 44 by 44 CSS pixels.
- Match the reference's drawing functions and organization with original portal assets; do not promise identical native Windows rendering or menus on every screen size.
5.2 Required tools and controls — full Paint-style toolkit
Group	Required features	Behavior
Pencil	Fine freehand drawing	Uses the selected color and adjustable size.
Brushes	Standard brush, pen, calligraphy pen/brush, airbrush, oil brush, crayon, marker, natural pencil, watercolor	Each preset has a distinct working stroke style and a visible sample; changing labels alone is insufficient.
Size	Paint-style vertical sidebar slider, numeric pixel value, common presets, live stroke preview	Applies to pencil, brushes, eraser, and shape outlines where relevant. Set a documented range of 1–100 logical canvas pixels.
Opacity	Vertical sidebar slider and displayed percentage	Range 1–100%; applies to supported painting/fill tools. Disable or explain unsupported combinations.
Eraser	Adjustable-size eraser	Erases on the active layer; restores transparency on drawing layers, with the white background visible beneath.
Bucket Fill	Contiguous-region flood fill, adjustable tolerance	Respects the active layer, selected color, opacity, and closed boundaries; preview/replay must produce the same result.
Color Picker	Eyedropper	Samples the visible canvas and updates the selected primary/secondary color.
Colors	Visible basic swatches, primary/secondary colors, swap, custom swatches, spectrum picker, HEX/RGB input	Clearly show both active colors; provide explicit touch controls rather than requiring right-click.
Shapes	Line, multi-point curve, polygon, oval, rectangle, rounded rectangle, triangle, right triangle, diamond, pentagon, hexagon, left/right/up/down arrows, four/five/six-point stars, heart, lightning bolt, rectangular callout, oval callout, and cloud callout	Drag to size; adjust before commit. Provide outline/fill choices and outline width.
Shape styling	No outline/fill, solid color, crayon, marker, oil, natural-pencil, and watercolor outline/fill styles	Use primary color for outline and secondary for fill; show disabled options where a style is not applicable.
Text	Editable text box, font family, size, bold, italic, underline, strikethrough, left/center/right alignment, foreground color, transparent/solid background	Use an approved font set and store the settings needed for consistent preview rendering. Typing is disabled once committed unless explicitly reselected for text editing.
Selection	Rectangular and free-form selection, select all, deselect, invert selection, transparent selection	Select only existing portal artwork on the active layer; support opaque/transparent selection with a selected background color. No external clipboard images.
Selection editing	Move, internal copy/cut/paste, duplicate, delete, scale, rotate 90 degrees left/right or 180 degrees, flip horizontal/vertical	Use a portal-internal clipboard. Preview transformations and commit them as undoable operations.
Image operations	Crop to selection, resize by pixels or percentage, maintain aspect ratio, horizontal/vertical skew, rotate, flip	Apply within the fixed contest canvas: crop/resize artwork and reframe it on the same logical canvas rather than changing submission dimensions or stretching the interface.
Layers	Add, rename, select, reorder, hide/show, duplicate, delete, merge down, merge visible/flatten, per-layer opacity	Keep the white background fixed. All tools operate on the selected editable layer; judging uses the visible composite.
View	Magnifier, pinch zoom, pan, zoom slider, zoom percentage, zoom in/out, 100%, Fit to Screen, rulers, gridlines, full-screen/focus mode	Zoom/pan changes the view only. Gridlines, rulers, selection handles, and cursors must never appear in the submitted artwork.
History	Undo, Redo	Cover strokes, fills, shapes, text, selections/transforms, layer actions, and clear; one undo step per logical edit.
Clear	Clear active layer; Clear Canvas with confirmation	Clearing does not restart an attempt or timer.


5.2.1 Additional required Paint controls
- Brush gallery: show a selectable visual sample for every brush, not a generic brush icon or text-only dropdown. Support stroke smoothing and applicable texture/opacity settings.
- Size controls: provide visible presets, the vertical slider, numeric entry, a brush-footprint preview, and a reset action. Keep the active value visible while drawing.
- Colors: primary/secondary indicators, swap, reset to black/white, recently used colors, editable custom swatches, a color spectrum, and synchronized HEX, RGB, and HSL values. Text backgrounds and transparent selections must use the appropriate selected color.
- Shape creation: preview while dragging, constrain proportions/angles with Shift on desktops, provide an equivalent touch toggle, and allow move/resize/style changes before commit. Support multi-point construction and explicit completion/cancel for polygons and curves.
- Selection commands: rectangular/free-form selection, Select All, Invert Selection, Deselect, opaque/transparent selection, Cut, Copy, internal Paste, Duplicate, Delete, Crop to Selection, and resize/rotate/flip handles. Paste is limited to artwork copied inside the same attempt.
- Image adjustments: pixel/percentage resize, aspect-ratio lock, horizontal/vertical skew, rotate left/right, 180-degree rotation, and horizontal/vertical flip, with previews and Apply/Cancel. Keep the contest output dimensions consistent by fitting/reframing the transformed artwork on the fixed canvas.
- Canvas properties: display logical width/height, background/transparency, current zoom, pointer coordinates on hover-capable devices, and selection dimensions. Changing browser size must not resize artwork. Participants cannot change official contest output dimensions.
- Layers panel: thumbnails, active-layer indicator, rename, add, duplicate, reorder, show/hide, opacity, merge down, merge visible/flatten, delete, and a transparency checkerboard. Preserve an immutable white judging background beneath transparent artwork.
- Background removal: provide a dedicated action that removes background from artwork already created in the portal. Preview the result, allow cancel/undo, and preserve transparency on the active layer. Operate on existing artwork only; do not import images or generate replacement content. Define and test the chosen removal method rather than promising Microsoft's proprietary model output.
- History and shortcuts: Undo/Redo buttons and desktop shortcuts; standard editing shortcuts for same-attempt internal artwork; Escape to cancel an uncommitted action; Delete to remove a selection. Shortcuts must not interfere with text entry.
- View controls: zoom percentage/slider, zoom in/out, 100%, Fit to Screen, pan, rulers, gridlines, and full-screen/focus mode. Provide touch alternatives for mouse/keyboard interactions.
- Tool help: short tooltips, clear disabled states, selected-state highlighting, and accessible labels. Every visible tool must be functional; do not show placeholder buttons.
5.2.2 Scope of Paint parity
- All drawing and editing controls listed above are required, rather than optional future enhancements. Use the supplied screenshot as the layout reference.
- The portal provides the Paint-style drawing/editing toolkit inside a timed browser contest. Windows file menus, printing, external clipboard/file access, Copilot, generative fill/erase, image generation, and Microsoft account integrations are outside this toolkit and remain excluded.
- Automatic background removal is included as an editing operation on existing portal artwork; it does not permit generated artwork or image imports.
- Exact native Windows behavior, proprietary brush algorithms, and proprietary background-removal results are not guaranteed. Required presets, settings, transformations, and saved output must be implemented and tested explicitly.
5.3 Input and rendering behavior
- Support finger, stylus, mouse, and trackpad. Draw with one pointer; reserve deliberate two-finger gestures for view navigation. Switching tools must not lose work.
- Display a size-accurate cursor on hover-capable devices and a live sample while adjusting size on touch devices. Account for zoom when showing the brush footprint.
- Brush textures, spray patterns, and other randomized effects must use stored seeds/parameters so replay, recovery, and judging reproduce the accepted drawing.
- Keep the same logical canvas size/aspect ratio for every participant. Resizing the browser or rotating the device must not distort, clear, or change artwork.
- Preserve layer order, visibility, opacity, text settings, fill parameters, selection transforms, and operation order in saved drawing data.
- Commit pending shape/text/selection edits before submission and only while the server deadline permits. At expiry, preserve the last server-accepted state; uncommitted local previews are not submitted.
- Prevent drawing gestures from scrolling the page; keep surrounding controls and navigation usable. Avoid accidental marks during pinch/pan.
- Support desktop shortcuts for undo/redo and portal-internal selection editing while preserving normal behavior in text inputs.
- Render feedback locally and keep long-running fills, textures, and preview processing from blocking the countdown or toolbar.
5.4 Contest restrictions and saving
- This expanded scope permits built-in fills, shapes, text, layers, and transformations; it replaces the earlier freehand-only restriction. Original artwork must still be created inside the portal.
- Do not allow file uploads, image imports, external clipboard paste, drag-and-drop images, stickers, pre-made artwork, templates, AI generation, Copilot, or external content. Internal copy/paste may reuse only existing artwork from the same attempt.
- Accept validated drawing operations through the API, not arbitrary image files, image URLs, HTML, executable content, or uploaded fonts.
- Generate previews from authoritative accepted operation/layer data. Store enough information to reproduce all permitted tools, not only freehand coordinates.
- Autosave and restore every committed supported operation, including fills, text, shapes, layers, and transforms. Undo/redo must stay consistent with revisions.
- Disable all artwork-changing controls before Start and after submission/expiry. Read-only zoom/pan may remain available on the employee's authorized confirmation screen.
- Reject manual submission of a visually empty composite. Finalize an empty composite at expiry as expired-empty, ineligible for judging. Hidden layers and blank text must not make an entry eligible.
- Clear Canvas, changing tools, zooming, and undo/redo must never reset the timer or create a new attempt.
6. Timing and attempt lifecycle
6.1 Server-controlled deadline
- Each attempt lasts exactly 15 minutes (900 seconds).
- Store server-generated started_at and deadline_at; deadline_at = started_at + 900 seconds.
- Display remaining time as MM:SS, initially 15:00, based on the server deadline rather than a decrement-only browser counter.
- Show visible warnings at 5 minutes and 1 minute remaining. Do not rely only on color.
- Refresh, logout/login, device-clock changes, browser backgrounding, Clear Canvas, and reconnecting must not extend the deadline.
- The server rejects edits received at or after the deadline and after final submission. Client-provided timestamps cannot authorize late edits.
6.2 States
State	Meaning	Allowed next state
In progress	Attempt started and deadline not reached	Submitted, Expired, Expired-empty
Submitted	Employee finalized a non-empty drawing before the deadline	None
Expired	Deadline reached; latest server-saved non-empty drawing finalized	None
Expired-empty	Deadline reached with no server-saved visible drawing	None


- Logging in does not consume an attempt. Successfully creating an in-progress attempt does.
- At expiry, lock the canvas and finalize the latest accepted server-saved drawing.
- Finalization must work without an active browser, through a server-side scheduled mechanism. Every write must also check the deadline immediately, even if the scheduler has not run yet.
- Finalization must be idempotent. Repeated requests must not create duplicate entries or change the finalized drawing.
- One employee may have at most one in-progress attempt per contest, including during testing.
- Use atomic server/database enforcement for attempt creation and finalization to prevent simultaneous requests from bypassing restrictions.
7. Attempt restriction and admin testing control
7.1 Default: one official attempt
- Enforce one official attempt per normalized employee ID per contest, across browsers, tabs, sessions, and devices.
- An in-progress, submitted, expired, or expired-empty official attempt counts against this limit.
- An employee with a valid original session may resume the same in-progress attempt until its existing deadline.
- A completed official attempt cannot be restarted, edited, or replaced by changing the name, clearing browser data, or logging in again.
7.2 Admin setting: Allow repeat attempts (testing)
- Provide an admin-panel toggle labeled Allow repeat attempts (testing).
- Default value: OFF. Persist the setting on the server per contest.
- OFF: enforce the one-official-attempt policy.
- ON: allow an employee to start another attempt after their current attempt has completed, even if they have already used an official attempt.
- Every attempt started while this setting is ON is permanently marked as a test attempt, including an employee's first attempt.
- Test attempts do not consume the employee's one official attempt and must be excluded from winner selection and official submission counts.
- Every new test attempt starts with a blank canvas and a fresh 15-minute deadline. Preserve previous attempts and submissions; never overwrite them.
- Show a visible Testing Mode banner in the participant experience and admin panel while enabled.
- Show the current setting and a warning that repeat attempts are available to every participant while ON. Use a separate staging environment for testing when available.
- Turning the setting OFF blocks new test attempts immediately. Existing attempts retain their original deadline and test/official classification and may finish normally.
- Turning the setting ON does not reclassify or unlock earlier official submissions.
- Keep test entries clearly labeled and filterable in admin views even after testing is disabled.
- Record each toggle change with administrator ID, previous value, new value, and server timestamp.
- Employees must not be able to modify or bypass this setting through the UI or API.
8. Autosave, recovery, and connectivity
- Render drawing operations locally without waiting for network requests.
- Batch committed drawing operations to the server at least every 3 seconds while editing; promptly save completed edits where practical. Include brushes, fills, text, shapes, transformations, history changes, and layers. Avoid sending unchanged full canvases repeatedly.
- Keep a local recovery copy scoped to the session and attempt. Do not expose it to a later employee using the same device.
- Display Saving, Saved, Offline, and Save failed states. Saved must mean server acknowledgement, not only a local write.
- On reconnect before the deadline, synchronize pending operations in order without duplicating operations.
- Use operation sequence numbers or equivalent revision checks to prevent stale saves from overwriting newer data.
- Refresh or rotation must restore saved work in the original authorized session without resetting time.
- Offline time continues to count. The local UI locks at the known deadline; the server independently enforces it.
- Operations arriving after the deadline are rejected, including operations claimed to have been drawn offline before expiry. Explain that unsynchronized work may be lost.
- Treat the latest server-accepted drawing as authoritative. Do not promise recovery of edits that never reached the server.
- Prevent simultaneous editing of an attempt in multiple tabs/devices through a server-enforced active-editor mechanism; additional editors must be blocked or read-only.
9. Submission
- Provide a Submit Drawing button while the attempt is active.
- Require confirmation that submission is final; the timer continues during confirmation.
- Save pending valid changes and finalize the entry atomically, or with equivalent concurrency protection, before reporting success.
- If the deadline passes during submission, apply expiry rules and retain only server-accepted pre-deadline work.
- Disable edits after finalization and reject subsequent update requests on the server.
- Show a confirmation only after server acknowledgement, with a unique entry reference and whether completion was manual or automatic.
- A failed request must not show a false success message. Retry safely or retrieve the existing finalized status if the outcome is uncertain.
- Generate a consistent preview with a fixed background and orientation for judging; preview-generation retries must not change the finalized drawing.
10. Admin panel
10.1 Access and contest settings
- Use separate protected administrator authentication; employee name/ID login is insufficient for admin access.
- Enforce administrator permissions on every admin API operation.
- Configure contest title, instructions, opening time, closing time, and timezone.
- Allow administrators to open or close entry access and manage the repeat-attempt testing toggle.
- Do not start attempts before opening or after closing. Allow only starts whose full 15-minute duration fits within the closing time; display the last permissible start time.
- Closing new entry access manually does not cancel existing attempts or change their deadlines.
- Show dates in the configured contest timezone and store timestamps in UTC.
10.2 Dashboard and review
- Display counts for participants, active attempts, official submissions, expired-empty attempts, and test attempts separately.
- Provide a paginated gallery with preview, anonymous entry reference, official/test label, completion status, and completion time.
- Allow search by employee name or full employee ID in authorized admin views, and filters for status and official/test entries.
- Provide a full-size drawing view. Hide employee identity by default during judging, with deliberate admin access to identity details.
- Keep submissions private; do not provide an employee-facing public gallery in the initial release.
- Permit administrators to select or change one winner from finalized, non-empty official submissions. Test entries and active attempts are ineligible.
- Show the selected winner in the admin panel and audit winner changes. Public announcement is outside the initial scope.
- Do not allow administrators to alter participants' saved drawings through review tools.
11. Data requirements
Entity	Required data
Participant	Internal ID, full employee ID as a unique string, employee name, created timestamp
Contest	ID, title, instructions, timezone, opening/closing timestamps, entry-access status, duration of 900 seconds, repeat-testing setting
Attempt	ID, participant ID, contest ID, attempt number, immutable test/official classification, state, start/deadline/finalization timestamps, completion method, last accepted revision
Drawing	Attempt ID, logical canvas dimensions, validated drawing operations, layer state, and rendering parameters, last saved timestamp, generated preview reference
Winner	Contest ID, eligible attempt ID, selecting admin ID, selection timestamp
Audit event	Admin ID, action, affected record, prior/new values where relevant, timestamp


Enforce at most one official attempt per participant per contest and at most one active attempt per participant per contest with database constraints or equivalent atomic safeguards. Historical test attempts must remain separate records.
12. Security and privacy
- Serve the portal over HTTPS and use secure session cookies with appropriate expiry and request protections.
- Validate all inputs and drawing operations server-side, including ownership, contest state, deadline, tool types, brush values, fill parameters, shape/text content, layer/transform operations, coordinates, and payload limits.
- Set explicit limits on request size, operation count, layer count, text length, coordinate count, and save frequency before release; reject excessive input with useful messages.
- Apply rate limits to login, start, save, and submission endpoints without disrupting normal drawing.
- Keep drawing data private in Neon and enforce ownership/admin authorization in server endpoints. If cached image files are introduced, use separate private object storage and authorized access. Keep database credentials, authentication secrets, and storage keys out of browser code.
- Render employee names as text; prevent script injection.
- Log failures and privileged changes without logging session secrets.
- Define an approved retention period and deletion process for employee details and drawings before production launch.
- These controls prevent ordinary import and retry abuse; they cannot prove that every stroke was manually drawn or prevent reference tracing/automated input.
13. Compatibility, usability, and performance
- Support current stable Safari on iPhone/iPad, Chrome on Android, and Chrome, Edge, Firefox, and Safari on supported desktops at release.
- Test touch, stylus, mouse, portrait/landscape rotation, refresh, backgrounding, and interrupted connectivity on representative real devices.
- Use responsive controls, readable timer text, labeled inputs, keyboard-operable non-drawing controls, and visible focus states.
- Keep the countdown and submission controls accessible on small screens without covering the drawing area.
- A conventional freehand canvas is not fully accessible to every employee; organizers must define an alternative participation process if needed.
- Confirm expected total and simultaneous participants before capacity sign-off. Load-test start/save/finalize operations at that agreed concurrency, including a common expiry-time spike.
- Define and verify response-time and error-rate targets against that load before launch. Drawing feedback must remain local and responsive during saves.
- Monitor failed saves, finalization failures, authentication failures, and storage/database availability. Verify a backup and recovery procedure before the event.
14. Recommended implementation baseline
Layer	Proposed choice
Application	Next.js, React, TypeScript
Drawing	HTML Canvas with Pointer Events
Server endpoints	Next.js route handlers with server-only database access
Database	Neon PostgreSQL
Drawing storage and previews	Validated drawing operations and layer state in Neon PostgreSQL JSONB; render previews from saved data behind authorized routes. Optional private object storage for cached images.
Admin authentication	Separate administrator login using ADMIN_USERNAME / ADMIN_PASSWORD environment variables and a signed, expiring session cookie.
Hosting	Vercel or approved equivalent
Scheduled processing	Server-side expiry finalization and preview retries


Technology choices remain subject to existing company infrastructure and hosting approval. Employee access follows the name/ID flow specified above; admin authentication must not silently introduce employee email or SSO requirements.
14.1 Database
- Use Neon PostgreSQL as the portal database.
- Do not read .env or .env.* files. Do not access or query the live database through development tooling.
14.2 Application flow
1. Employee opens /, enters name and 4-digit suffix; the server validates ^LA-IND-[0-9]{4}$ and creates a session (/api/login).
2. Rules/status screen shows attempt state (/api/status); nothing is consumed and no timer starts.
3. Employee acknowledges rules and clicks Start Drawing; the server atomically creates the attempt with deadline_at = started_at + 900s (/api/attempt/start). Official vs. test classification is fixed at this moment from the admin testing toggle.
4. Employee draws locally; committed drawing operations and layer changes autosave at least every 3 seconds with revision numbers (/api/attempt/save). /api/attempt/claim enforces a single active editor.
5. Employee submits (/api/attempt/submit) or time expires; the server finalizes idempotently as Submitted, Expired, or Expired-empty. Expiry is finalized by the scheduled job (/api/cron/finalize) and lazily on every write.
6. Employee sees a locked confirmation with entry reference, status, and completion method.
7. Administrator signs in at /admin (/api/admin/login), configures the contest and the Allow repeat attempts (testing) toggle, reviews the dashboard and gallery, views previews, and selects a winner among finalized non-empty official entries (/api/admin/*).
15. Acceptance criteria
ID	Scenario	Expected result
AC-01	Open the portal	Employee name and fixed-prefix employee ID login appear first.
AC-02	Enter suffix 0042	Full ID is LA-IND-0042; leading zeros remain intact.
AC-03	Enter letters, signs, spaces, decimals, or wrong-length suffix	Client and server reject the ID.
AC-04	Log in and read instructions	No attempt is consumed and no timer starts.
AC-05	Start a drawing	One attempt is created and the server deadline is 900 seconds after start.
AC-06	Refresh, change device clock, clear canvas, or reopen original session	Same attempt and deadline remain.
AC-07	Try import, paste-image, or drop-image actions	No external content enters the canvas; arbitrary image submissions are rejected by the API.
AC-08	Submit non-empty work before expiry	Latest accepted drawing is finalized once, locked, and confirmed.
AC-09	Allow time to expire or close the browser	Server finalizes the latest saved drawing without requiring a browser callback.
AC-10	Send an edit after expiry/submission	Server rejects it and finalized data stays unchanged.
AC-11	Start a second official attempt with testing OFF	Server rejects it, including from a new browser or changed employee name.
AC-12	Enable testing and complete multiple attempts with one ID	Sequential fresh test attempts work, each has 15 minutes, and all earlier records remain.
AC-13	Make a test attempt, then disable testing	Unused official attempt remains available; an already-used official attempt stays blocked.
AC-14	Disable testing during an active test attempt	It may finish at its original deadline; new test attempts are blocked.
AC-15	Attempt concurrent starts or editing	No duplicate official/active attempts or competing writers are permitted.
AC-16	Disconnect and reconnect before expiry	Pending operations synchronize safely and time does not reset.
AC-17	Reconnect after expiry	Late edits are rejected; latest server-saved drawing is retained.
AC-18	Open admin/gallery APIs as an employee	Access is denied.
AC-19	Select a test or empty entry as winner	Server rejects the selection.
AC-20	Enter a previously used employee ID in a new unauthenticated session	Existing private drawing data is not disclosed.
AC-21	Submit twice or retry after an uncertain response	One finalized entry exists and the same result is returned.
AC-22	Attempt an empty manual submission or let empty work expire	Manual submission is rejected; expiry creates an ineligible expired-empty record.
AC-23	Start too close to contest closing	Start is rejected if the full 15-minute duration cannot fit.
AC-24	Select each pencil/brush preset and adjust size/opacity	Distinct working strokes appear, active settings and live preview are visible, and controls work by touch.
AC-25	Use Bucket Fill and Color Picker	Bounded fill and sampled colors work and reproduce after save/reload.
AC-26	Create styled shapes and formatted text	Artwork is editable before commit and persists identically in recovery and judging previews.
AC-27	Select, duplicate, move, scale, rotate, flip, crop, or resize existing artwork	Operations work within the fixed contest canvas and are undoable.
AC-28	Change layers, order, visibility, opacity, or merge	Recovered and judged composites match accepted visible artwork.
AC-29	Use Undo/Redo for each supported edit type	The accepted operation history and rendered artwork remain consistent.
AC-30	Open the workspace on a phone	Large canvas remains the focus; swatches, tools, size access, timer, and Submit are usable without overlapping drawable content.
AC-31	Zoom, pan, show grid/rulers, and rotate device	Artwork stays unchanged; view aids never appear in submitted previews.
AC-32	Reload textured/randomized brushes and layered drawings	Rendering is deterministic from stored operations and parameters.
AC-33	Paste external text/images or import content	External content is rejected; only same-attempt portal-internal artwork copying is allowed.
AC-34	Hide/delete all visible artwork before finalization	The composite is treated as empty even if hidden layers contain edits.
AC-35	Use expanded shape and style galleries	Every listed shape and outline/fill style is selectable and produces persistent artwork.
AC-36	Use resize/skew, transparent selection, and layer flattening	Each action previews, commits, undoes/redoes, and restores correctly without changing official output dimensions.
AC-37	Use background removal on portal-created artwork	Result previews with transparency, supports Cancel/Undo, saves correctly, and introduces no external/generated content.
AC-38	Inspect the complete toolbar on desktop and phone	Every listed tool has a working control, readable active settings, and a touch-compatible interaction.


16. Excluded from the initial release
- Image uploads and external-content insertion, including external clipboard content.
- AI-generated artwork, Copilot, generative fill/erase, and non-drawing Windows integrations. Background removal of existing portal artwork is included in Section 5.
- Native Windows menus, OS clipboard integration, and exact pixel-for-pixel desktop layout on phones.
- Public voting, live rankings, AI judging, and automatic quality scoring.
- Employee-facing public gallery and automated winner announcements.
- Native mobile apps and required installations.
- Employee SSO/OTP, verified identity, per-employee retry grants, and cross-device self-service recovery.
- Retroactive editing, timer extensions, or replacement of official submissions.
17. Pre-launch confirmations
- Confirm that every employee ID has exactly four digits after LA-IND-.
- Accept the limitations of self-declared employee identification or separately approve verified authentication.
- Confirm event dates, timezone, last-start policy, participation volume, judging criteria, and tie-breaking process.
- Confirm administrator accounts, approved hosting, retention period, and support contact.
- Confirm organizer approval for shapes, text, fill, selections, and layers, which replace the original freehand-only scope.
- Re-estimate implementation effort and test coverage for the expanded Paint-style toolset; the earlier basic-canvas estimate does not cover these features.
- Disable repeat-attempt testing before official participation and verify the setting on the admin dashboard.# Halloween
# Halloween
