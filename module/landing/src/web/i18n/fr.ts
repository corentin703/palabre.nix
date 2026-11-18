/**
 * Textes de l'interface en français : la référence, dont `Messages` tire la forme que chaque
 * langue doit respecter. Les balises <b> et <em> mettent en valeur une partie d'un texte.
 */
export const fr = {
  localeName: 'Français',

  install: {
    title: "Installer l'application",
    text: "Installez cette application sur votre appareil pour y accéder plus vite.",
    action: 'Installer',
    dismiss: 'Plus tard',
  },

  join: {
    titleNew: 'Visioconférence',
    titleExisting: 'Rejoindre la visioconférence',
    leadNew: 'Veuillez indiquer l’intitulé du salon (et, si vous le souhaitez, votre prénom), puis cliquer sur « Créer les liens ».',
    leadExisting: 'Veuillez renseigner votre prénom, puis valider d’un clic sur le bouton principal.',
    moderatorBanner: 'Vous rejoignez ce salon en tant que modérateur.',
    keepLinksTitle: 'Ne perdez pas vos liens',
    keepLinksText:
      'Le site ne retient rien sur vous : sans votre lien de modérateur, vous ne pourrez plus modérer ce salon. Recevez dès maintenant les deux liens par courriel, c’est le plus sûr.',
    settings: 'Paramètres du salon',
    locked: 'Verrouillé',
    lockLabel: 'Fermer le salon aux nouveaux invités',
    lockHelp:
      'Une fois tout le monde arrivé, un nouvel invité qui ouvre le lien d’invitation est refusé. Les modérateurs peuvent toujours entrer et les personnes présentes restent.',
    room: 'Salon',
    roomName: 'Intitulé du salon',
    roomPlaceholder: 'par exemple : reunion-bureau',
    yourName: 'Votre prénom',
    namePlaceholder: 'par exemple : Camille',
    submitNew: 'Créer les liens',
    submitExisting: 'Rejoindre la visioconférence',
    preparing: 'Préparation du salon…',
    connecting: 'Connexion en cours…',
    soleModeratorNote:
      "Vous arriverez sur votre page de modérateur : vous y copierez les deux liens (l'un à transmettre aux autres participants, l'autre à conserver pour vous), règlerez le salon, puis entrerez dans la réunion.",
  },

  share: {
    participantsLink: 'Lien à transmettre aux autres participants',
    moderatorLink: 'Votre lien de modérateur',
    moderatorNote:
      "À conserver pour vous seul : il vous permet de retrouver vos droits de modérateur depuis n'importe quel appareil, même dans plusieurs semaines (envoyez-le vous par courriel). Ne le transmettez pas aux autres participants.",
    copy: 'Copier',
    copied: 'Lien copié',
    emailLabel: 'Recevoir les deux liens par courriel',
    emailPlaceholder: 'par exemple : camille@exemple.fr',
    emailHistory: 'Adresses utilisées précédemment',
    emailSend: 'Envoyer',
    emailSending: 'Envoi…',
    emailSent: 'Courriels envoyés : un avec le lien d’invitation, un avec votre lien de modérateur.',
    emailNote:
      'Vous recevez deux courriels distincts : celui du lien d’invitation peut être transféré aux participants, celui du lien de modérateur ne doit pas l’être. Votre adresse n’est pas conservée.',
  },

  history: {
    title: 'Vos dernières réunions',
    note: 'Cliquez sur un intitulé pour y retourner. Cette liste demeure exclusivement sur cet appareil.',
    clear: 'Effacer cette liste',
  },

  guide: {
    title: "Mode d'emploi",
    stepsExisting: [
      'Veuillez saisir <b>votre prénom</b> dans la case ci-dessus.',
      'Validez ensuite en cliquant sur le bouton principal <b>« Rejoindre la visioconférence »</b>.',
    ],
    stepsNew: [
      'Veuillez choisir un <b>intitulé pour le salon</b>, par exemple <em>reunion-bureau</em>, et, si vous le souhaitez, saisir <b>votre prénom</b>.',
      'Cliquez sur le bouton principal <b>« Créer les liens »</b> : vous arrivez sur votre page de modérateur, où vous copiez les deux liens (voir plus bas) et réglez le salon.',
      'Sur cette page, indiquez <b>votre prénom</b> s\'il n\'y est pas, puis cliquez sur <b>« Rejoindre la visioconférence »</b>.',
    ],
    stepsCommon: [
      "Votre navigateur sollicite alors l'autorisation d'employer la <b>caméra</b> et le <b>micro</b> : veuillez cliquer sur <b>« Autoriser »</b>. À défaut, nul ne pourra vous voir ni vous entendre.",
      'Vous voilà en réunion, dans un <b>nouvel onglet</b> : cette page reste ouverte dans l\'onglet précédent. Les autres participants vous rejoindront au fur et à mesure.',
    ],
    whoModerates: 'Qui est modérateur ?',
    moderatorOfThisRoom:
      'Vous avez ouvert le <b>lien de modérateur</b> de ce salon : vous en êtes modérateur, quel que soit l\'ordre d\'arrivée.',
    moderatorTitle: 'Vous êtes modérateur : ce que vous pouvez faire',
    moderatorInMeeting:
      '<b>Pendant la réunion</b> : couper le micro d\'un participant, l\'exclure, ou clore la réunion pour tout le monde.',
    moderatorLock:
      '<b>Depuis cette page</b>, dans <b>« Paramètres du salon »</b> : fermer le salon aux nouveaux invités une fois tout le monde arrivé. Un nouvel invité qui ouvre le lien d\'invitation est alors refusé, alors que vous (et tout autre modérateur) pouvez toujours entrer. Les personnes présentes restent, et vous pouvez rouvrir le salon à tout moment.',
    moderatorShare:
      '<b>Sous le formulaire</b> : copier le lien d\'invitation pour de nouveaux participants, ou le lien de modérateur pour une personne de confiance, ou vous envoyer les deux liens par courriel.',
    moderatorKeep:
      '<b>Conservez ce lien</b> (dans vos notes ou par courriel) : il est le seul moyen de retrouver vos droits, depuis n\'importe quel appareil.',
    participantOfThisRoom:
      'Vous entrez en <b>simple participant</b>. Seule la personne qui a créé le salon, ainsi que celles à qui elle a confié son lien de modérateur, en assure la modération.',
    twoLinks: 'Les deux liens et leur rôle',
    twoLinksIntro:
      "Sur votre page de modérateur, <b>deux liens</b> apparaissent sous le formulaire. Cliquez sur <b>« Copier »</b> pour en recopier un, puis collez-le dans un courriel ou un message (clic droit, « Coller »).",
    participantsLinkRole:
      '<b>Le lien à transmettre aux autres participants</b> : toute personne qui l\'ouvre entre dans le salon en <b>simple participant</b>, après avoir indiqué son prénom.',
    moderatorLinkRole:
      '<b>Votre lien de modérateur</b> : toute personne qui l\'ouvre devient <b>modérateur</b> du salon (couper le micro d\'un participant, l\'exclure, clore la réunion). Vous pouvez donc le confier à une personne de confiance, mais à personne d\'autre.',
    whyKeepTitle: 'Pourquoi conserver votre lien de modérateur ?',
    whyKeep1:
      "Les liens restent valables durablement : vous pouvez créer un salon longtemps à l'avance. Votre qualité de modérateur ne dépend <b>ni de l'appareil, ni de l'ordre d'arrivée</b> : si un participant se connecte avant vous, il reste simple participant, et vous retrouvez vos droits dès que vous ouvrez votre lien de modérateur, depuis un téléphone comme depuis un ordinateur.",
    whyKeep2:
      "Le site ne retient rien sur vous : <b>sans ce lien, vos droits de modérateur ne peuvent pas être retrouvés</b>. Envoyez-le vous par courriel ou conservez-le dans vos notes. Sur l'appareil que vous venez d'utiliser, la liste « Vos dernières réunions » le retient également.",
    whyKeep3:
      "Enfin, saisir le même intitulé qu'une autre personne ne permet pas de rejoindre son salon : chacun obtient le sien. Pour rejoindre un salon, il faut toujours en avoir reçu le lien.",
    troubleTitle: 'En cas de difficulté',
    troubleNoSound:
      "<b>On ne vous entend pas ou on ne vous voit pas</b> : cliquez sur le cadenas ou sur l'icône de caméra située à gauche de l'adresse du site, autorisez la caméra et le micro, puis actualisez la page (touche F5).",
    troubleNoHearing:
      "<b>Vous n'entendez personne</b> : veuillez vérifier le volume de l'ordinateur ainsi que le branchement de vos écouteurs.",
    troubleFrozen:
      '<b>La page est figée</b> : actualisez-la au moyen de la touche F5. Vous réintégrerez la même réunion.',
    leaveTitle: 'Pour quitter la réunion',
    leave:
      "Cliquez sur le bouton de sortie au sein de la réunion, ou fermez simplement l'onglet. La réunion se poursuit pour les autres participants.",
    leaveNote:
      'Lorsque le dernier participant a quitté le salon, celui-ci est supprimé : le tableau blanc, la discussion et les fichiers déposés sont définitivement effacés. Pensez à les enregistrer ou à les exporter au préalable.',
  },

  admin: {
    title: 'Administration de la visio',
    token: "Jeton d'administration",
    login: 'Se connecter',
    refresh: 'Actualiser',
    logout: 'Se déconnecter',
    activeRooms: 'Salles ouvertes',
    pastRooms: 'Salles terminées (30 dernières)',
    room: 'Salon',
    participants: 'Participants',
    created: 'Créée le',
    ended: 'Terminée le',
    noActiveRoom: 'Aucune salle ouverte.',
    noPastRoom: 'Aucune salle terminée.',
    joinAsModerator: 'Rejoindre en modérateur',
    actions: 'Actions',
    observe: 'Observer en incognito',
    observeHelp:
      'Rejoint la réunion sans être vu de personne (modérateurs compris), en vue seule : l’écran de la réunion, sans caméra, micro, chat ni liste des participants. Un seul observateur à la fois par salon.',
    copyInvitation: 'Copier le lien d’invitation',
    copyModerator: 'Copier le lien modérateur',
    copied: 'Copié',
    lockRoom: 'Verrouiller',
    unlockRoom: 'Déverrouiller',
    lockHelp:
      "Verrouillé : plus aucun nouvel invité ne peut rejoindre le salon. Les modérateurs (lien modérateur ou administration) peuvent toujours entrer, et les personnes déjà présentes restent.",
    locked: 'Verrouillé',
    closeRoom: 'Fermer / supprimer',
    confirmClose: (title: string) =>
      `Fermer et supprimer le salon « ${title} » ?\n\nLes participants sont déconnectés. Le tableau blanc, le chat et les fichiers déposés sont effacés définitivement.`,
    errorStatus: (status: number) => `Erreur ${status}`,
    newLinks: 'Générer de nouveaux liens',
    newLinksHelp:
      "Crée un nouveau salon (nouveau lien participants et nouveau lien modérateur). Les anciens liens ne sont pas modifiés ni révoqués.",
    roomName: 'Nom du salon',
    generate: 'Générer',
  },

  errors: {
    invalid_request: 'Requête invalide.',
    rate_limited: 'Le nombre de tentatives autorisé est dépassé ; veuillez patienter quelques minutes.',
    invalid_room: 'Intitulé de salon invalide (lettres, chiffres et tirets uniquement).',
    too_many_rooms:
      'Le nombre maximal de réunions simultanées est atteint ; veuillez réessayer dans quelques minutes.',
    not_moderator: 'Seul un modérateur du salon peut faire cela.',
    save_failed: "L'enregistrement a échoué ; veuillez réessayer.",
    room_closed: 'Cette réunion est fermée aux nouveaux participants ; veuillez vous adresser à son organisateur.',
    join_failed:
      "Il n'est pas possible de rejoindre le salon pour le moment ; veuillez réessayer ultérieurement.",
    bad_token: 'Jeton incorrect.',
    too_many_attempts: 'Trop de tentatives, réessayez dans quelques minutes.',
    unauthorized: 'Non authentifié.',
    plugnmeet_failed: "L'API PlugNMeet a échoué",
    not_found: 'Introuvable.',
    invalid_email: 'Adresse de courriel invalide.',
    mail_rejected:
      "Le serveur de messagerie a refusé cette adresse ; veuillez vérifier qu'elle est correcte.",
    mail_partial:
      "Un seul des deux courriels a pu être envoyé (le lien d'invitation). Veuillez réessayer : vous recevrez à nouveau les deux.",
    mail_failed: "L'envoi des courriels a échoué ; veuillez réessayer ultérieurement.",
    mail_disabled: "L'envoi par courriel n'est pas disponible.",
    network: 'Le serveur ne répond pas ; veuillez réessayer.',
  },
};

export type Messages = typeof fr;
