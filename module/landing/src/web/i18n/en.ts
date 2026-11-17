import type { Messages } from './fr';

export const en: Messages = {
  localeName: 'English',

  install: {
    title: 'Install the app',
    text: 'Install this app on your device to open it faster.',
    action: 'Install',
    dismiss: 'Not now',
  },

  join: {
    titleNew: 'Video conference',
    titleExisting: 'Join the video conference',
    leadNew: 'Please enter a name for the room and your first name, then confirm.',
    leadExisting: 'Please enter your first name, then confirm with the main button.',
    moderatorBanner: 'You are joining this room as a moderator.',
    room: 'Room',
    roomName: 'Room name',
    roomPlaceholder: 'for example: team-meeting',
    yourName: 'Your first name',
    namePlaceholder: 'for example: Alex',
    submitNew: 'Confirm and enter the room',
    submitExisting: 'Join the video conference',
    preparing: 'Preparing the room…',
    mailAskTitle: 'Get the links by email?',
    mailAskText:
      'Before you enter, you can get two emails: one with the invitation link to send to the participants, one with your moderator link, which lets you get your rights back later. Your address is not kept.',
    mailAskSend: 'Send the links and enter the room',
    mailAskSkip: 'No thanks, enter the room',
    connecting: 'Connecting…',
    soleModeratorNote:
      "You will be the only moderator of this room. Two links will be offered below: one to send to the other participants, the other to keep for yourself.",
  },

  share: {
    participantsLink: 'Link to send to the other participants',
    moderatorLink: 'Your moderator link',
    moderatorNote:
      'Keep it to yourself: it lets you get your moderator rights back from any device, even weeks from now (email it to yourself). Do not send it to the other participants.',
    copy: 'Copy',
    copied: 'Link copied',
    emailLabel: 'Get both links by email',
    emailPlaceholder: 'for example: camille@example.com',
    emailSend: 'Send',
    emailSending: 'Sending…',
    emailSent: 'Emails sent: one with the invitation link, one with your moderator link.',
    emailNote:
      'You get two separate emails: the invitation one can be forwarded to the participants, the moderator one must not be. Your address is not kept.',
  },

  history: {
    title: 'Your latest meetings',
    note: 'Click a name to go back to it. This list stays on this device only.',
    clear: 'Clear this list',
  },

  guide: {
    title: 'How it works',
    stepsExisting: [
      'Please enter <b>your first name</b> in the box above.',
      'Then confirm by clicking the main button <b>“Join the video conference”</b>.',
    ],
    stepsNew: [
      'Please choose a <b>name for the room</b>, for example <em>team-meeting</em>. Two links are then generated (see below).',
      'Please enter <b>your first name</b>.',
      'Confirm by clicking the main button <b>“Confirm and enter the room”</b>.',
    ],
    stepsCommon: [
      'Your browser then asks for permission to use the <b>camera</b> and the <b>microphone</b>: please click <b>“Allow”</b>. Otherwise nobody will be able to see or hear you.',
      "You are in the meeting. The other participants will join you as they arrive.",
    ],
    whoModerates: 'Who is a moderator?',
    moderatorOfThisRoom:
      'You opened the <b>moderator link</b> of this room: you can mute a participant, remove them or end the meeting. Keep this link to get your rights back later.',
    participantOfThisRoom:
      'You are entering as a <b>regular participant</b>. Only the person who created the room, and those they gave their moderator link to, moderate it.',
    twoLinks: 'The two links and what they do',
    twoLinksIntro:
      'As soon as the room name is entered, <b>two links</b> appear under the form. Click <b>“Copy”</b> to copy one, then paste it into an email or a message (right click, “Paste”).',
    participantsLinkRole:
      '<b>The link to send to the other participants</b>: anyone who opens it enters the room as a <b>regular participant</b>, after giving their first name.',
    moderatorLinkRole:
      '<b>Your moderator link</b>: anyone who opens it becomes a <b>moderator</b> of the room (mute a participant, remove them, end the meeting). You can hand it to someone you trust, but to nobody else.',
    whyKeepTitle: 'Why keep your moderator link?',
    whyKeep1:
      "The links stay valid for a long time: you can create a room well in advance. Being a moderator depends on <b>neither the device nor the order of arrival</b>: if a participant connects before you, they stay a regular participant, and you get your rights back as soon as you open your moderator link, on a phone as well as on a computer.",
    whyKeep2:
      'The site remembers nothing about you: <b>without this link, your moderator rights cannot be recovered</b>. Email it to yourself or keep it in your notes. On the device you just used, the “Your latest meetings” list also keeps it.',
    whyKeep3:
      'Finally, entering the same name as someone else does not let you join their room: everyone gets their own. To join a room you always need to have received its link.',
    troubleTitle: 'If something goes wrong',
    troubleNoSound:
      "<b>Nobody hears or sees you</b>: click the padlock or the camera icon to the left of the site address, allow the camera and the microphone, then reload the page (F5).",
    troubleNoHearing:
      "<b>You can't hear anyone</b>: please check the computer's volume and that your headphones are plugged in.",
    troubleFrozen:
      '<b>The page is frozen</b>: reload it with the F5 key. You will get back into the same meeting.',
    leaveTitle: 'Leaving the meeting',
    leave:
      'Click the exit button inside the meeting, or simply close the tab. The meeting goes on for the other participants.',
    leaveNote:
      'When the last participant has left, the room is deleted: the whiteboard, the chat and the uploaded files are permanently erased. Remember to save or export them beforehand.',
  },

  admin: {
    title: 'Video conference administration',
    token: 'Administration token',
    login: 'Sign in',
    refresh: 'Refresh',
    logout: 'Sign out',
    activeRooms: 'Open rooms',
    pastRooms: 'Past rooms (last 30)',
    room: 'Room',
    participants: 'Participants',
    created: 'Created',
    ended: 'Ended',
    noActiveRoom: 'No open room.',
    noPastRoom: 'No past room.',
    joinAsModerator: 'Join as moderator',
    copyInvitation: 'Copy invitation link',
    copyModerator: 'Copy moderator link',
    copied: 'Copied',
    closeRoom: 'Close / delete',
    confirmClose: (title: string) =>
      `Close and delete the room “${title}”?\n\nParticipants are disconnected. The whiteboard, the chat and the uploaded files are erased permanently.`,
    errorStatus: (status: number) => `Error ${status}`,
    newLinks: 'Generate new links',
    newLinksHelp:
      'Creates a new room (new participants link and new moderator link). Existing links are neither changed nor revoked.',
    roomName: 'Room name',
    generate: 'Generate',
  },

  errors: {
    invalid_request: 'Invalid request.',
    rate_limited: 'Too many attempts; please wait a few minutes.',
    invalid_room: 'Invalid room name (letters, digits and hyphens only).',
    join_failed: 'The room cannot be joined right now; please try again later.',
    bad_token: 'Wrong token.',
    too_many_attempts: 'Too many attempts, try again in a few minutes.',
    unauthorized: 'Not signed in.',
    plugnmeet_failed: 'The PlugNMeet API failed',
    not_found: 'Not found.',
    mail_failed: 'The emails could not be sent; please try again later.',
    mail_disabled: 'Sending by email is not available.',
    network: 'The server does not answer; please try again.',
  },
};
