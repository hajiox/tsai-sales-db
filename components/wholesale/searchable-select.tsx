// /components/wholesale/searchable-select.tsx ver.1
'use client'

import { useState } from 'react'
import { Input } from "@/components/ui/input"
import { Search, Plus } from 'lucide-react'

interface SearchableSelectProps {
  options: any[]
  value: string
  onChange: (value: string) => void
  placeholder: string
  displayKey: string
  valueKey: string
  onAddNew?: () => void
  addNewLabel?: string
}

export function SearchableSelect({ 
  options, 
  value, 
  onChange, 
  placeholder,
  displayKey,
  valueKey,
  onAddNew,
  addNewLabel
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  
  const filteredOptions = options.filter(option => 
    option[displayKey].toLowerCase().includes(searchTerm.toLowerCase())
  )
  
  const selectedOption = options.find(opt => opt[valueKey] === value)
  
  return (
    <div className="relative">
      <div className="relative">
        <Input
          type="text"
          placeholder={placeholder}
          value={searchTerm || (selectedOption ? selectedOption[displayKey] : '')}
          onChange={(e) => {
            setSearchTerm(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => {
            setIsOpen(true)
            setSearchTerm('')
          }}
          className="pr-8"
        />
        <Search className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
      </div>
      
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
          {onAddNew && addNewLabel && (
            <button
              className="w-full text-left px-3 py-2 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium border-b flex items-center gap-2"
              onClick={() => {
                setIsOpen(false)
                setSearchTerm('')
                onAddNew()
              }}
            >
              <Plus className="h-4 w-4" />
              {addNewLabel}
            </button>
          )}
          
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">該当なし</div>
          ) : (
            filteredOptions.map((option) => (
              <button
                key={option[valueKey]}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                onClick={() => {
                  onChange(option[valueKey])
                  setSearchTerm('')
                  setIsOpen(false)
                }}
              >
                {option[displayKey]}
              </button>
            ))
          )}
        </div>
      )}
      
      {isOpen && (
        <div 
          className="fixed inset-0 z-0" 
          onClick={() => {
            setIsOpen(false)
            setSearchTerm('')
          }}
        />
      )}
    </div>
  )
}
