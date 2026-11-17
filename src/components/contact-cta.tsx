import { PillLink } from "@/components/ui";

/**
 * Homepage closing call to action: no form here, just a nudge to the contact
 * page (also reachable from the Contact button in the header).
 */
export function ContactCta() {
  return (
    <section id="contact" aria-labelledby="contact-cta" className="bg-white pt-8 pb-24 sm:pb-32">
      <div className="wrap flex flex-col items-center text-center">
        <h2 id="contact-cta" data-scroll className="fx-slide section-title">
          Let&apos;s build
          <br />
          something together
        </h2>
        <p data-scroll data-lag={0.1} className="fx-rise mt-6 max-w-[460px] text-[17px] leading-[1.42] text-black/62">
          Websites, web apps or graphics: head over to the contact page, or hit Contact in the menu up top, and tell
          me what you&apos;re planning. I usually reply within a couple of days.
        </p>
        <div data-scroll data-lag={0.2} className="fx-rise mt-10">
          <PillLink href="/contact">Get in touch</PillLink>
        </div>
      </div>
    </section>
  );
}
