# Geppetto student SSO return

Lantern remains Lantern for students who open Lantern directly.

The Class Website authorize path is contextual SSO only. Presentation is
purpose-aware: Make Up Assignment wording is used only when the sanitized
callback `next` carries `makeup=1`. Generic Student Login uses Class Website /
Student Sign In wording.

See the canonical contract:

`Geppetto-Full-Deploy-V6` → `docs/STUDENT_SSO_RETURN_CONTRACT.md`

Do not create a second identity system. Do not share session cookies across
`tmslantern.org` and `mrradle.us`. Do not widen `geppetto-student-authorize`
to staff.
