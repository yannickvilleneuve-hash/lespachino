<?php
/**
 * Plugin Name: Hino — carrousel des camions en stock
 * Description: Shortcode [hino_carrousel] qui rend la bande des 8 camions de l'accueil en HTML natif, à partir de /feeds/carrousel.json de l'app pacman. Remplace l'iframe.
 * Version:     1.1.0
 * Author:      Centre du camion Hino
 *
 * Installation: copier ce fichier dans wp-content/mu-plugins/ (créer le dossier
 * s'il n'existe pas). Un mu-plugin est actif d'office, sans passer par
 * Extensions. L'ancienne iframe `/vehicule/carrousel` de la page d'accueil est
 * remplacée automatiquement (filtre the_content) dès que le JSON a répondu une
 * fois; on peut aussi coller [hino_carrousel] dans un bloc « Code court ».
 *
 * Fonctionnement:
 *  - Le JSON est lu au plus une fois toutes les 5 minutes et gardé en option
 *    (pas en transient: une option survit à un vidage de cache d'objets).
 *  - Quand la copie est périmée, on sert la copie périmée TOUT DE SUITE et on
 *    programme un rafraîchissement WP-Cron en arrière-plan. Aucun visiteur
 *    n'attend jamais le serveur de l'app.
 *  - Si l'app ne répond pas (panne, internet résidentiel), la dernière copie
 *    valide reste affichée indéfiniment. Un JSON vide ou invalide est ignoré,
 *    jamais enregistré: on ne remplace pas 8 camions par rien.
 *  - Seul le tout premier affichage (aucune copie en base) fait un appel
 *    synchrone, borné à 4 s; s'il échoue on affiche le bloc de repli.
 *
 * Réglages (wp-config.php, facultatif):
 *   define('HINO_CARROUSEL_URL', 'https://feeds.hinochicoutimi.com/feeds/carrousel.json');
 *   define('HINO_CARROUSEL_TTL', 300);   // secondes
 *   define('HINO_CARROUSEL_PHONE', '418 543-1234');
 */

if (!defined('ABSPATH')) {
    exit;
}

final class Hino_Carrousel
{
    const OPTION     = 'hino_carrousel_data';
    const LOCK       = 'hino_carrousel_refresh_lock';
    const FAIL       = 'hino_carrousel_fetch_failed';
    const CRON_HOOK  = 'hino_carrousel_refresh';
    const DEFAULT_URL = 'https://feeds.hinochicoutimi.com/feeds/carrousel.json';
    const DEFAULT_TTL = 300;
    const TIMEOUT_SYNC  = 4;
    const TIMEOUT_ASYNC = 15;
    const MAX_ITEMS = 12;

    public static function boot(): void
    {
        add_shortcode('hino_carrousel', [self::class, 'shortcode']);
        add_action(self::CRON_HOOK, [self::class, 'refresh']);
        // Remplace l'ancienne iframe du carrousel dans le contenu des pages,
        // sans qu'on ait à éditer la page dans Gutenberg. Tant que le JSON n'a
        // jamais répondu, l'iframe reste en place: on ne remplace jamais
        // quelque chose qui marche par un bloc de repli.
        add_filter('the_content', [self::class, 'replace_legacy_iframe'], 20);
        // WP-CLI / debug: `wp hino-carrousel refresh` n'existe pas, mais
        // ?hino_carrousel_refresh=1 en admin connecté force une lecture.
        add_action('admin_init', [self::class, 'maybe_force_refresh']);
    }

    private static function url(): string
    {
        return defined('HINO_CARROUSEL_URL') ? HINO_CARROUSEL_URL : self::DEFAULT_URL;
    }

    private static function ttl(): int
    {
        return defined('HINO_CARROUSEL_TTL') ? (int) HINO_CARROUSEL_TTL : self::DEFAULT_TTL;
    }

    private static function phone(): string
    {
        return defined('HINO_CARROUSEL_PHONE') ? (string) HINO_CARROUSEL_PHONE : '';
    }

    /* ------------------------------------------------------------ data */

    /**
     * Lit le JSON. Retourne le tableau décodé, ou null si HTTP != 200, JSON
     * invalide, ou liste vide — dans les trois cas l'appelant garde l'ancien.
     */
    private static function fetch(int $timeout): ?array
    {
        $res = wp_remote_get(self::url(), [
            'timeout'    => $timeout,
            'headers'    => ['Accept' => 'application/json'],
            'user-agent' => 'camion-hino.ca carrousel/1.0',
        ]);
        if (is_wp_error($res) || (int) wp_remote_retrieve_response_code($res) !== 200) {
            return null;
        }
        $data = json_decode((string) wp_remote_retrieve_body($res), true);
        if (!is_array($data) || empty($data['items']) || !is_array($data['items'])) {
            return null;
        }
        $items = [];
        foreach (array_slice($data['items'], 0, self::MAX_ITEMS) as $it) {
            if (!is_array($it) || empty($it['title']) || empty($it['url'])) {
                continue;
            }
            $items[] = [
                'title'     => (string) $it['title'],
                'price'     => (string) ($it['price'] ?? ''),
                'condition' => (string) ($it['condition'] ?? ''),
                'photo'     => isset($it['photo']) && is_string($it['photo']) ? $it['photo'] : '',
                'url'       => (string) $it['url'],
            ];
        }
        if (!$items) {
            return null;
        }
        return [
            'items'         => $items,
            'inventory_url' => (string) ($data['inventoryUrl'] ?? home_url('/inventaire/')),
            'fetched_at'    => time(),
        ];
    }

    /** Cible WP-Cron: rafraîchit en arrière-plan, garde l'ancien sur échec. */
    public static function refresh(): void
    {
        $fresh = self::fetch(self::TIMEOUT_ASYNC);
        if ($fresh) {
            update_option(self::OPTION, $fresh, false);
        }
        delete_transient(self::LOCK);
    }

    public static function maybe_force_refresh(): void
    {
        if (isset($_GET['hino_carrousel_refresh']) && current_user_can('manage_options')) {
            self::refresh();
        }
    }

    /** Copie à afficher maintenant, en déclenchant un rafraîchissement si périmée. */
    private static function data(): ?array
    {
        $cached = get_option(self::OPTION);
        $valid  = is_array($cached) && !empty($cached['items']);

        if ($valid && (time() - (int) $cached['fetched_at']) < self::ttl()) {
            return $cached;
        }

        if ($valid) {
            // Périmée: on la sert quand même et on programme la relecture.
            if (!get_transient(self::LOCK)) {
                set_transient(self::LOCK, 1, 120);
                if (!wp_next_scheduled(self::CRON_HOOK)) {
                    wp_schedule_single_event(time(), self::CRON_HOOK);
                }
            }
            return $cached;
        }

        // Jamais lue: seul cas où le visiteur attend, et pas plus de 4 s — et
        // pas plus d'une fois par TTL: un échec est mémorisé pour que les
        // visiteurs suivants ne repaient pas l'attente tant que l'app est
        // absente (ex.: mu-plugin installé avant le déploiement du JSON).
        if (get_transient(self::FAIL)) {
            return null;
        }
        $fresh = self::fetch(self::TIMEOUT_SYNC);
        if ($fresh) {
            update_option(self::OPTION, $fresh, false);
        } else {
            set_transient(self::FAIL, 1, self::ttl());
        }
        return $fresh;
    }

    /* ---------------------------------------------------------- render */

    /** Filtre the_content: l'iframe `/vehicule/carrousel` devient la bande native. */
    public static function replace_legacy_iframe(string $content): string
    {
        if (is_admin() || stripos($content, 'vehicule/carrousel') === false) {
            return $content;
        }
        $cached = get_option(self::OPTION);
        if (!is_array($cached) || empty($cached['items'])) {
            // Pas encore de données: on tente une lecture (bornée), et si ça
            // échoue on laisse l'iframe telle quelle.
            if (!self::data()) {
                return $content;
            }
        }
        $out = preg_replace(
            '#<iframe\b[^>]*vehicule/carrousel[^>]*>\s*</iframe>#i',
            self::shortcode(),
            $content,
            1
        );
        return is_string($out) ? $out : $content;
    }

    public static function shortcode(): string
    {
        $data = self::data();
        ob_start();
        self::styles();
        echo '<div class="hino-strip" role="region" aria-label="Camions en stock">';
        if (!$data) {
            self::render_fallback();
        } else {
            self::render_track($data);
        }
        echo '</div>';
        return (string) ob_get_clean();
    }

    private static function render_fallback(): void
    {
        $phone = self::phone();
        echo '<div class="hino-strip__fallback">';
        echo '<p>Notre inventaire change vite. Appelez-nous pour savoir ce qui est disponible aujourd’hui.</p>';
        echo '<div class="hino-strip__fallback-actions">';
        if ($phone !== '') {
            $tel = preg_replace('/[^0-9+]/', '', $phone);
            echo '<a class="hino-strip__btn hino-strip__btn--red" href="tel:' . esc_attr($tel) . '">' . esc_html($phone) . '</a>';
        }
        echo '<a class="hino-strip__btn" href="' . esc_url(home_url('/inventaire/')) . '">Voir l’inventaire</a>';
        echo '</div></div>';
    }

    private static function render_track(array $data): void
    {
        echo '<ul class="hino-strip__track">';
        $i = 0;
        foreach ($data['items'] as $it) {
            $i++;
            echo '<li class="hino-strip__card">';
            echo '<a href="' . esc_url($it['url']) . '" target="_blank" rel="noopener noreferrer">';
            echo '<div class="hino-strip__photo">';
            if ($it['photo'] !== '') {
                // Les 4 premières sont visibles d'emblée: chargement immédiat.
                // Les autres sont hors champ tant qu'on ne fait pas défiler.
                $lazy = $i > 4 ? ' loading="lazy"' : ' fetchpriority="high"';
                echo '<img src="' . esc_url($it['photo']) . '" alt="' . esc_attr($it['title']) . '" width="260" height="195" decoding="async"' . $lazy . '>';
            }
            if ($it['condition'] !== '') {
                echo '<span class="hino-strip__tag">' . esc_html($it['condition']) . '</span>';
            }
            echo '</div>';
            echo '<div class="hino-strip__body">';
            echo '<h3 class="hino-strip__title">' . esc_html($it['title']) . '</h3>';
            if ($it['price'] !== '') {
                echo '<p class="hino-strip__price"><span>' . esc_html($it['price']) . '</span></p>';
            }
            echo '</div></a></li>';
        }
        echo '<li class="hino-strip__card hino-strip__card--all">';
        echo '<a href="' . esc_url($data['inventory_url']) . '">';
        echo '<span class="hino-strip__all-title">Voir tout l’inventaire</span>';
        echo '<span class="hino-strip__all-sub">Tous les camions disponibles, avec photos et prix</span>';
        echo '<span class="hino-strip__all-arrow" aria-hidden="true">→</span>';
        echo '</a></li>';
        echo '</ul>';
        echo '<button type="button" class="hino-strip__arrow hino-strip__arrow--prev" data-dir="-1" aria-label="Camions précédents"><span aria-hidden="true">‹</span></button>';
        echo '<button type="button" class="hino-strip__arrow hino-strip__arrow--next" data-dir="1" aria-label="Camions suivants"><span aria-hidden="true">›</span></button>';
        self::script();
    }

    private static function styles(): void
    {
        static $done = false;
        if ($done) {
            return;
        }
        $done = true;
        // Même rendu que app/vehicule/carrousel: bande 380 px, cartes 260 px,
        // Oswald (déjà chargée par le thème), rouge #ed1c24.
        ?>
<style>
.hino-strip{position:relative;height:380px;overflow:hidden;background:#0e0e0f;color:#fff;font-family:Oswald,"Roboto",sans-serif}
.hino-strip__track{display:flex;align-items:center;gap:12px;height:100%;margin:0;padding:0 16px;list-style:none;overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding-left:16px;scroll-behavior:smooth;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.hino-strip__track::-webkit-scrollbar{display:none}
@media(min-width:640px){.hino-strip__track{padding:0 48px;scroll-padding-left:48px}}
.hino-strip__card{flex:0 0 260px;width:260px;scroll-snap-align:start;margin:0;padding:0}
.hino-strip__card>a{display:block;height:340px;overflow:hidden;background:#141416;color:#fff;text-decoration:none;transition:background .2s}
.hino-strip__card>a:hover{background:#1a1a1d}
.hino-strip__photo{position:relative;aspect-ratio:4/3;overflow:hidden;background:#000}
.hino-strip__photo img{display:block;width:100%;height:100%;object-fit:cover;transition:transform .3s}
.hino-strip__card>a:hover .hino-strip__photo img{transform:scale(1.03)}
.hino-strip__tag{position:absolute;left:0;top:0;padding:4px 8px;background:rgba(0,0,0,.7);font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.7)}
.hino-strip__body{padding:12px}
.hino-strip__title{margin:0;height:42px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:14px;font-weight:700;line-height:1.25;letter-spacing:-.01em;text-transform:uppercase;color:#fff}
.hino-strip__price{margin:8px 0 0}
.hino-strip__price span{display:inline-block;padding:4px 10px;background:#ed1c24;font-size:16px;font-weight:700;letter-spacing:-.01em;color:#fff}
.hino-strip__card--all>a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:0 24px;text-align:center;border:1px solid rgba(255,255,255,.15)}
.hino-strip__card--all>a:hover{border-color:#ed1c24}
.hino-strip__all-title{font-size:18px;font-weight:700;line-height:1.1;text-transform:uppercase}
.hino-strip__all-sub{font-size:14px;color:rgba(255,255,255,.5)}
.hino-strip__all-arrow{font-size:24px;color:#ed1c24}
.hino-strip__arrow{position:absolute;top:50%;display:none;width:40px;height:40px;transform:translateY(-50%);border:0;padding:0;background:rgba(0,0,0,.6);color:#fff;font-size:22px;line-height:40px;cursor:pointer;transition:background .2s}
.hino-strip__arrow:hover,.hino-strip__arrow:focus-visible{background:#ed1c24}
.hino-strip__arrow--prev{left:4px}.hino-strip__arrow--next{right:4px}
@media(min-width:640px){.hino-strip__arrow{display:block}}
.hino-strip__fallback{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;height:100%;padding:0 24px;text-align:center}
.hino-strip__fallback p{margin:0;font-size:14px;color:rgba(255,255,255,.7)}
.hino-strip__fallback-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:12px}
.hino-strip__btn{display:inline-block;padding:8px 20px;border:1px solid rgba(255,255,255,.3);font-size:14px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.8);text-decoration:none}
.hino-strip__btn:hover{border-color:#fff;color:#fff}
.hino-strip__btn--red{background:#ed1c24;border-color:#ed1c24;color:#fff;font-weight:700}
.hino-strip__btn--red:hover{background:#c81820;border-color:#c81820}
</style>
        <?php
    }

    private static function script(): void
    {
        static $done = false;
        if ($done) {
            return;
        }
        $done = true;
        // 272 = largeur de carte (260) + espacement (12): une flèche = une carte.
        ?>
<script>
(function(){
  document.querySelectorAll('.hino-strip').forEach(function(strip){
    var track = strip.querySelector('.hino-strip__track');
    if (!track) return;
    strip.querySelectorAll('.hino-strip__arrow').forEach(function(btn){
      btn.addEventListener('click', function(){
        track.scrollBy({left: 272 * Number(btn.dataset.dir), behavior: 'smooth'});
      });
    });
  });
})();
</script>
        <?php
    }
}

Hino_Carrousel::boot();
