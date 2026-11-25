// Short version for display: "1.1.0" -> "1.1"
const VERSION = __APP_VERSION__.replace(/\.0$/, '')

type Props = { onContactDeveloper?: () => void }

/**
 * Bottom bar under the chat list and under the chat.
 * Text sits on the left; the right side is left empty for the "Powered by Netlify" badge.
 */
export function Footer({ onContactDeveloper }: Props) {
  return (
    <footer className="app-footer">
      <span>chatme v{VERSION}</span>
      {onContactDeveloper && (
        <>
          <span aria-hidden="true">·</span>
          <button className="link" onClick={onContactDeveloper}>
            Написать разработчику
          </button>
        </>
      )}
    </footer>
  )
}
