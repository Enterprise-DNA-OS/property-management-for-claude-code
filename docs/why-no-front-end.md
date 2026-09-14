# Why there is no front end

Palace is a database with a subscription. The tables underneath it are ordinary: owners, properties,
tenancies, tenants, a rent ledger, inspections, maintenance jobs, notices. A handful of workflows
you repeat every week. What you pay for is the layer on top that lets people who do not write SQL
get at those tables. Screens, filters, dashboards, forms.

That layer used to be the whole product, because talking to a database was hard. It is not hard any
more. Open this folder in Claude Code, describe what you want, and it writes the query, runs it, and
explains the answer. Ask a question the dashboard never had a chart for and you still get an answer.

## What you gain

- **Better answers.** A dashboard shows what the vendor decided to chart. Here you ask your own
  question, in your own words, against your own data. "Which owners cost more in maintenance than
  they pay us in fees" is a sentence, not a change request.
- **No per-property fee.** Everyone who needs to look can look, and the bill does not grow with the
  rent roll. A hundred more properties costs you nothing.
- **Your data in your Postgres.** Plain tables. Back them up, query them from anything, leave any
  time. There is no export step because there is nothing to leave.
- **A process that matches you.** When your way of working changes, you add a command. You do not
  wait for a feature request to clear a vendor's roadmap.
- **The compliance register is a first class thing.** Seven items per property, each with a status,
  a date and the regulation it comes from, checked by one command. That is not a screen you paid
  extra for, it is the shape of the data.

## What you give up

Read this part properly. These are real.

- **The inspection app on the phone.** This is the biggest one. A property manager standing in a
  bathroom taking twenty photographs needs an app with a camera, offline mode and a room-by-room
  form. This is a database and a command line. You can record an inspection here room by room and
  render a branded report from it, but you are typing it up afterwards, and the photographs live in
  your own file store with a reference in the note. If your team does eight inspections a day on
  iPads, keep the app you have and use this for everything around it.
- **A drag and drop board.** Maintenance status is a field you ask about, not a card you move.
- **A tenant portal and an owner portal.** Owners get a branded HTML summary you send them. Tenants
  get an email you wrote. Nobody logs in.
- **Live updates while two people watch.** The database is shared, so two people can work at once,
  but nothing moves on a screen in front of you.
- **A vendor help desk.** This is open source. Enterprise DNA supports the installed version for
  agencies that want someone to call.

## Who this fits

Small and mid sized agencies who already use Claude Code, or who would rather learn to ask than
learn another interface. Agencies whose real pain is the arrears file, the compliance register and
the owner reporting, not the data entry.

If your team needs a screen to look at all day, keep Palace. If you need the answers more than the
screens, this is cheaper, faster and yours.

Installed and run for you: https://enterprisedna.co/omni/instead-of/palace
