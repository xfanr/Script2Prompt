import { defineComponent, h, type Component } from 'vue'
import {
  AddFour, Attention, BeachUmbrella, Box, CardTwo, CarouselVideo, CheckOne, CheckSmall, CircleRightUp,
  CloseSmall, Copy, Crown, DataArrival, Delete as ParkDelete, Down, DownloadTwo,
  Edit, ExpandDown, Flag as ParkFlag, Local, MessageEmoji, Moon as ParkMoon, More, Order,
  People, Peoples, PicOne, PlaybackProgress, Plus as ParkPlus, PreviewOpen, Right, RightSmallUp, Search as ParkSearch, SettingTwo,
  Slide, SlideTwo, SortTwo, Star as ParkStar, SunOne, Switch as ParkSwitch, Sync,
  UploadTwo, VipOne, Voice, VoiceOff, Wallet,
} from '@icon-park/vue-next'
import '@icon-park/vue-next/styles/index.css'

// Keep existing call sites and Element Plus icon sizing while applying the chosen themes.
function icon(component: Component, theme: 'outline' | 'filled' = 'outline') {
  return defineComponent({
    name: 'AppIcon',
    setup: () => () => h(component, { theme, size: '1em', fill: 'currentColor', strokeWidth: 4 }),
  })
}

export const AddIcon = icon(ParkPlus)
export const ArrowDown = icon(Down)
export const ArrowRight = icon(Right)
export const Calendar = icon(Order)
export const Check = icon(CheckSmall)
export const CircleCheckFilled = icon(CheckOne, 'filled')
export const Close = icon(CloseSmall)
export const CloseBold = icon(CloseSmall)
export const Coin = icon(Wallet)
export const CloneCharacters = icon(CardTwo)
export const CopyDocument = icon(Copy)
export const CrownFilled = icon(Crown, 'filled')
export const DataAnalysis = icon(SlideTwo)
export const DataLine = icon(Slide)
export const Delete = icon(ParkDelete)
export const Document = icon(SlideTwo)
export const DocumentCopy = icon(RightSmallUp)
export const DialogueTabIcon = icon(MessageEmoji)
export const Download = icon(DownloadTwo)
export const EditPen = icon(Edit)
export const Expand = icon(ExpandDown)
export const Files = icon(Box)
export const Flag = icon(ParkFlag, 'filled')
export const Grape = icon(Peoples)
export const Location = icon(Local)
export const MaterialTabIcon = icon(CarouselVideo)
export const Microphone = icon(Voice)
export const Moon = icon(ParkMoon)
export const MoreFilled = icon(More, 'filled')
export const Mute = icon(VoiceOff)
export const Notebook = icon(Slide)
export const Plus = icon(AddFour)
export const Position = icon(BeachUmbrella)
export const Refresh = icon(Sync)
export const Search = icon(ParkSearch)
export const Setting = icon(SettingTwo)
export const Share = icon(CircleRightUp)
export const ShotTabIcon = icon(PlaybackProgress)
export const Sort = icon(SortTwo)
export const Star = icon(ParkStar)
export const StarFilled = icon(ParkStar, 'filled')
export const Sunny = icon(SunOne)
export const Switch = icon(ParkSwitch)
export const Tickets = icon(DataArrival)
export const Upload = icon(UploadTwo)
export const User = icon(People)
export const UserFilled = icon(People, 'filled')
export const VideoPlay = icon(PicOne)
export const View = icon(PreviewOpen)
export const VipFilled = icon(VipOne, 'filled')
export const WarningFilled = icon(Attention, 'filled')
